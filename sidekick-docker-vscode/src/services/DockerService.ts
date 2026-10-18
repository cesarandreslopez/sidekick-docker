import { LogSlot } from './LogSlot';
import {
  DockerClient,
  DockerStateStore,
  CachedComposeFileReader,
  ComposeClient,
  ComposeDetector,
  ComposeFileReader,
  EventWatcher,
  FollowStream,
  StatsCollector,
  StatsSampler,
  MAX_LOG_LINES,
  shortId,
  throwIfComposeFailed,
  resolveComposeOptions,
  errorMessage,
  formatBytes,
  explainDockerUnreachable,
  describeDockerEndpoint,
} from 'sidekick-docker-shared';
import { LogAnalytics, LogSeverityTimeSeries, detectSeverity } from 'sidekick-docker-shared/log';
import type {
  ContainerInfo,
  ContainerDetails,
  DockerClientOptions,
  ImageInfo,
  ImageLayer,
  FilesystemChange,
  VolumeInfo,
  NetworkInfo,
  ComposeProject,
  LogEntry,
  ContainerStats,
  ComposeExecResult,
  ComposeCommandOptions,
  SeverityCounts,
  StoreChange,
} from 'sidekick-docker-shared';

import type {
  DashboardStateSnapshot,
  SerializedContainerInfo,
  SerializedImageInfo,
  SerializedVolumeInfo,
  SerializedNetworkInfo,
  SerializedComposeProject,
  SerializedLogEntry,
  SerializedContainerStats,
  SerializedFilesystemChange,
  SerializedImageLayer,
  SerializedContainerDetails,
  StreamStateUpdate,
  DetailKind,
  DetailLoadUpdate,
} from '../types/messages';

export interface StatsChangeData {
  containerId: string;
  stats: SerializedContainerStats | null;
  loading: boolean;
  cpuHistory?: number[];
  memoryHistory?: number[];
  networkRxRateHistory?: number[];
  networkTxRateHistory?: number[];
  blockReadRateHistory?: number[];
  blockWriteRateHistory?: number[];
  logSeveritySeries?: { severity: string; total: number }[];
}

export interface DockerServiceCallbacks {
  onStateChange: (snapshot: DashboardStateSnapshot) => void;
  onLogsChange: (containerId: string, entries: SerializedLogEntry[], severityCounts: SeverityCounts) => void;
  onStatsChange: (data: StatsChangeData) => void;
  onComposeLogs: (projectName: string, serviceName: string | null, entries: SerializedLogEntry[]) => void;
  onDetailsLoaded: (containerId: string, details: SerializedContainerDetails) => void;
  onChangesLoaded: (containerId: string, changes: SerializedFilesystemChange[]) => void;
  onLayersLoaded: (imageId: string, layers: SerializedImageLayer[]) => void;
  onStreamState?: (update: StreamStateUpdate) => void;
  onDetailLoad?: (update: DetailLoadUpdate) => void;
}

/** Container events after which cached inspect details are out of date. */
const DETAIL_STALE_EVENTS = /^(start|restart|die|oom|health_status)\b/;

/** A compose log target: a whole project, or one service of it. */
interface ComposeKey {
  project: string;
  service: string | null;
}

export type DashboardPanelId = 'containers' | 'services' | 'images' | 'volumes' | 'networks';

export interface DockerServiceOptions {
  clientOptions?: DockerClientOptions;
  /**
   * Environment overrides for spawned `docker compose` processes, so they
   * target the same endpoint as the API client (see `dockerCliEnv`). Without
   * it, the socketPath setting is silently ignored by every compose action.
   */
  cliEnv?: Record<string, string>;
  refreshIntervalMs?: number;
  /** Directory for compose file detection and fallback cwd for compose actions. Undefined = no workspace. */
  cwd?: string;
  /**
   * Whether the workspace is trusted. Compose actions spawn `docker compose`,
   * which executes a compose file the workspace controls, so they are refused
   * when false — matching `capabilities.untrustedWorkspaces: "limited"` in the
   * manifest. Defaults to true so non-VSCode callers and tests are unaffected.
   */
  isTrusted?: boolean;
  /**
   * Whether the dashboard is visible when the service starts. A service created
   * behind a hidden panel (e.g. after a settings change) must not start the
   * event stream and polling interval until the panel is shown.
   */
  visible?: boolean;
  /** The raw endpoint setting, used to explain a failed connection. */
  endpoint?: string;
}

export type InitializeResult = { ok: true } | { ok: false; reason: string };

export interface DashboardViewState {
  activePanelId: DashboardPanelId;
  detailTabIndex: number;
  selectedItemId: string | null;
  composeProjectName: string | null;
  composeServiceName: string | null;
  sortField: 'state' | 'name' | 'cpu' | 'mem' | 'net' | 'io' | 'pids';
  visible: boolean;
  compareItemId: string | null;
  compareComposeProjectName: string | null;
  compareComposeServiceName: string | null;
}

export class DockerService {
  private client: DockerClient;
  private composeClient: ComposeClient;
  /** Domain state + refresh/event policy, shared with the TUI. */
  private store: DockerStateStore;
  private statsCollector = new StatsCollector();
  /**
   * Fills in stats for every row when the list needs them (a stats-based sort).
   * The single stats *stream* only ever covers the selected container.
   */
  private statsSampler: StatsSampler;
  private watcher: EventWatcher | null = null;

  private detailPending = new Map<string, Promise<void>>();
  private inspectedDetails = new Map<string, ContainerDetails>();
  private inspectedChanges = new Map<string, FilesystemChange[]>();
  private inspectedLayers = new Map<string, ImageLayer[]>();
  private logSeverityTimeSeries = new Map<string, LogSeverityTimeSeries>();

  /**
   * Selection-driven streams. Reconnect policy (end for stopped targets,
   * resume from the last timestamp, capped backoff) is the shared
   * FollowStream's, the same as the TUI's.
   */
  private logSlot: LogSlot<string>;
  private secondaryLogSlot: LogSlot<string>;
  private composeLogSlot: LogSlot<ComposeKey>;
  private secondaryComposeLogSlot: LogSlot<ComposeKey>;
  private statsContainerId: string | null = null;
  private statsStream: FollowStream<ContainerStats> | null = null;

  private refreshInterval: ReturnType<typeof setInterval> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private callbacks: DockerServiceCallbacks;
  private disposed = false;
  private cwd: string | undefined;
  private isTrusted: boolean;
  private refreshIntervalMs: number;
  private endpoint: string | undefined;
  private initialized = false;
  private viewState: DashboardViewState = {
    activePanelId: 'containers',
    detailTabIndex: 0,
    selectedItemId: null,
    composeProjectName: null,
    composeServiceName: null,
    sortField: 'state',
    visible: true,
    compareItemId: null,
    compareComposeProjectName: null,
    compareComposeServiceName: null,
  };

  constructor(callbacks: DockerServiceCallbacks, options?: DockerServiceOptions) {
    this.client = new DockerClient(options?.clientOptions);
    this.composeClient = new ComposeClient(options?.cliEnv);
    this.callbacks = callbacks;
    this.cwd = options?.cwd;
    this.store = new DockerStateStore({
      client: this.client,
      cwd: options?.cwd,
      composeReader: new CachedComposeFileReader(new ComposeFileReader(options?.cliEnv)),
      onChange: change => this.onStoreChange(change),
      log: (msg, err) => console.debug(msg, err ?? ''),
    });
    this.logSlot = this.containerLogSlot(true);
    this.secondaryLogSlot = this.containerLogSlot(false);
    this.composeLogSlot = this.composeSlot();
    this.secondaryComposeLogSlot = this.composeSlot();
    this.isTrusted = options?.isTrusted ?? true;
    this.refreshIntervalMs = options?.refreshIntervalMs ?? 30_000;
    this.endpoint = options?.endpoint;
    this.viewState.visible = options?.visible ?? true;
    this.statsSampler = new StatsSampler({
      sample: (id) => this.client.sampleStats(id),
      push: (id, stats) => {
        this.statsCollector.push(id, stats);
        // The collector lives in the extension host; the webview sorts from its
        // own `state.stats`, fed only by 'updateStats'. Without this the sampler
        // filled the collector and the list still compared zeros — the very bug
        // the sampler was added to fix.
        this.callbacks.onStatsChange({ containerId: id, stats: serializeStats(stats), loading: false });
      },
      onChange: () => { this.scheduleStateUpdate(); },
    });
  }

  async initialize(): Promise<InitializeResult> {
    const ping = await this.client.pingDetailed();
    if (this.disposed) return { ok: false, reason: 'Disposed' };
    // Say *why* (permission denied, no socket, refused, bad host) instead of
    // always asking "Is Docker running?".
    if (!ping.ok) return { ok: false, reason: explainDockerUnreachable(ping.error, describeDockerEndpoint(this.endpoint)) };

    await this.refresh();
    if (this.disposed) return { ok: false, reason: 'Disposed' };
    this.initialized = true;
    if (this.viewState.visible) {
      this.startLiveInfrastructure();
    }
    this.applyStreamDemand();
    return { ok: true };
  }

  /** Visibility is not part of this: it changes only through setVisible(), which starts/stops polling. */
  setViewState(next: Partial<DashboardViewState>): void {
    this.viewState = { ...this.viewState, ...next, visible: this.viewState.visible };
    this.applyStreamDemand();
    // Details invalidated by an event while another tab was showing are
    // re-loaded when Env or Config comes back into view.
    const v = this.viewState;
    if (this.initialized && v.activePanelId === 'containers' && v.selectedItemId
      && (v.detailTabIndex === 2 || v.detailTabIndex === 3) && !this.inspectedDetails.has(v.selectedItemId)) {
      void this.loadDetail('inspect', v.selectedItemId);
    }
  }

  async setVisible(visible: boolean): Promise<void> {
    if (this.viewState.visible === visible) return;
    this.viewState = { ...this.viewState, visible };

    if (!this.initialized || this.disposed) return;

    if (!visible) {
      this.stopLiveInfrastructure();
      this.stopAllStreams();
      this.statsSampler.setIds([]);
      return;
    }

    await this.refresh();
    if (this.disposed || !this.viewState.visible) return;
    this.callbacks.onStateChange(this.getStateSnapshot());
    this.startLiveInfrastructure();
    this.applyStreamDemand();
  }

  private startLiveInfrastructure(): void {
    if (this.disposed) return;

    if (!this.watcher) {
      this.watcher = new EventWatcher(this.client, {
        // The store's onChange schedules the update, and only when the event changed something.
        onEvent: (event) => {
          this.invalidateDetails(event);
          this.store.processEvent(event);
        },
        onError: (err) => console.debug('event watcher error:', err),
      });
      this.watcher.start();
    }

    if (!this.refreshInterval) {
      this.refreshInterval = setInterval(() => {
        this.refresh().then(() => this.scheduleStateUpdate()).catch(e => console.debug('periodic refresh failed:', e));
      }, this.refreshIntervalMs);
    }
  }

  private stopLiveInfrastructure(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
    if (this.watcher) {
      this.watcher.stop();
      this.watcher = null;
    }
  }

  private refresh(): Promise<void> {
    return this.store.refresh();
  }

  /**
   * A health or lifecycle event makes a container's inspect details (health
   * log, exit code, restart count) stale: drop them, and re-load at once if
   * that container's Env or Config tab is on screen.
   */
  private invalidateDetails(event: { type: string; resourceType: string; resourceId: string }): void {
    if (event.resourceType !== 'container' || !DETAIL_STALE_EVENTS.test(event.type)) return;
    this.inspectedDetails.delete(event.resourceId);
    const v = this.viewState;
    if (v.activePanelId === 'containers' && v.selectedItemId === event.resourceId && (v.detailTabIndex === 2 || v.detailTabIndex === 3)) {
      void this.loadDetail('inspect', event.resourceId, true);
    }
  }

  private onStoreChange(change: StoreChange): void {
    if (this.disposed) return;
    const snapshot = this.store.getSnapshot();
    if (change.cause === 'refresh') {
      const ids = new Set(snapshot.containers.map(c => c.id));
      for (const map of [this.inspectedDetails, this.inspectedChanges, this.logSeverityTimeSeries]) {
        for (const id of map.keys()) if (!ids.has(id)) map.delete(id);
      }
      const imageIds = new Set(snapshot.images.map(i => i.id));
      for (const id of this.inspectedLayers.keys()) if (!imageIds.has(id)) this.inspectedLayers.delete(id);
    }
    for (const id of change.removedContainerIds) {
      this.statsCollector.remove(id);
      this.inspectedDetails.delete(id);
      this.inspectedChanges.delete(id);
    }
    if (this.initialized) {
      this.applyStreamDemand();
      this.resumeStreams();
    }
    this.scheduleStateUpdate();
  }

  private scheduleStateUpdate(): void {
    if (this.debounceTimer || this.disposed) return;
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      if (!this.disposed) {
        this.callbacks.onStateChange(this.getStateSnapshot());
      }
    }, 100);
  }

  getStateSnapshot(): DashboardStateSnapshot {
    const s = this.store.getSnapshot();
    return {
      containers: s.containers.map(serializeContainer),
      images: s.images.map(serializeImage),
      volumes: s.volumes.map(serializeVolume),
      networks: s.networks.map(serializeNetwork),
      composeProjects: s.composeProjects.map(serializeComposeProject),
      daemonConnected: s.daemonConnected,
      resourceErrors: { ...s.resourceErrors },
      lastRefresh: s.lastRefresh?.toISOString() ?? null,
    };
  }

  // ─── View-driven streaming ──────────────────────────────────────

  private applyStreamDemand(): void {
    if (!this.initialized || this.disposed || !this.viewState.visible) {
      this.stopAllStreams();
      // The sampler is not a stream, so it survives the stopXStream calls. Left
      // running it polls one request per running container every 3s behind a
      // dashboard nobody is looking at.
      this.statsSampler.setIds([]);
      return;
    }

    const selectedItemId = this.viewState.selectedItemId;
    const wantsContainerLogs = this.viewState.activePanelId === 'containers'
      && (this.viewState.detailTabIndex === 0 || this.viewState.detailTabIndex === 6)
      && selectedItemId !== null;
    const wantsContainerStats = this.viewState.activePanelId === 'containers'
      && selectedItemId !== null
      && (this.viewState.detailTabIndex === 1 || needsLiveStats(this.viewState.sortField));
    const wantsComposeLogs = this.viewState.activePanelId === 'services'
      && this.viewState.detailTabIndex === 1
      && this.viewState.composeProjectName !== null;

    // Secondary compare streams: only when on Logs tab and a compare item is pinned
    const wantsSecondaryContainerLogs = wantsContainerLogs && this.viewState.detailTabIndex === 0
      && this.viewState.compareItemId !== null && this.viewState.compareItemId !== selectedItemId;
    const wantsSecondaryComposeLogs = wantsComposeLogs && this.viewState.compareComposeProjectName !== null
      && (this.viewState.compareComposeProjectName !== this.viewState.composeProjectName
        || this.viewState.compareComposeServiceName !== this.viewState.composeServiceName);

    // Sorting compares every row, so it needs a sample per container — not just
    // the selected one. Running containers only; stopped ones report zeros.
    this.statsSampler.setIds(
      this.viewState.activePanelId === 'containers' && needsLiveStats(this.viewState.sortField)
        // Skip whichever container has a live stream: it already produces
        // richer updates (with history series), and sampling it too would both
        // duplicate the request and race the stream's own values.
        ? this.store.getSnapshot().containers
            .filter(c => c.state === 'running' && c.id !== this.statsContainerId)
            .map(c => c.id)
        : [],
    );

    this.logSlot.ensure(wantsContainerLogs ? selectedItemId : null);
    this.ensureStatsStream(wantsContainerStats ? selectedItemId : null);
    this.composeLogSlot.ensure(wantsComposeLogs && this.viewState.composeProjectName !== null
      ? { project: this.viewState.composeProjectName, service: this.viewState.composeServiceName }
      : null);
    this.secondaryLogSlot.ensure(wantsSecondaryContainerLogs ? this.viewState.compareItemId : null);
    this.secondaryComposeLogSlot.ensure(wantsSecondaryComposeLogs && this.viewState.compareComposeProjectName !== null
      ? { project: this.viewState.compareComposeProjectName, service: this.viewState.compareComposeServiceName }
      : null);
  }

  private stopAllStreams(): void {
    this.logSlot.stop();
    this.stopStatsStream();
    this.composeLogSlot.stop();
    this.secondaryLogSlot.stop();
    this.secondaryComposeLogSlot.stop();
  }

  /** Targets may have changed state: let finished streams of now-running targets reconnect. */
  private resumeStreams(): void {
    this.logSlot.resume();
    this.secondaryLogSlot.resume();
    this.composeLogSlot.resume();
    this.secondaryComposeLogSlot.resume();
    this.statsStream?.resume();
  }

  private containerLogSlot(primary: boolean): LogSlot<string> {
    return new LogSlot<string>({
      kind: 'logs',
      same: (a, b) => a === b,
      itemId: id => id,
      open: (id, signal, { reconnect, cursor }) => {
        const since = reconnect ? cursor.sinceSeconds() : undefined;
        return this.client.streamLogs(id, since === undefined ? { follow: true, tail: 100 } : { follow: true, tail: MAX_LOG_LINES, since }, signal);
      },
      isRunning: id => this.store.isContainerRunning(id),
      onEntry: primary ? (id, entry) => {
        // Severity time-series for the Stats tab sparkline (primary stream only).
        let series = this.logSeverityTimeSeries.get(id);
        if (!series) { series = new LogSeverityTimeSeries(); this.logSeverityTimeSeries.set(id, series); }
        series.push(detectSeverity(entry.message));
      } : undefined,
      publish: (id, entries) => {
        if (this.disposed) return;
        const analytics = new LogAnalytics();
        for (const entry of entries) analytics.push(entry.message);
        // Compare-mode logs land in the webview's logs map under the compare
        // container's id, just like primary logs.
        this.callbacks.onLogsChange(id, entries.map(serializeLogEntry), analytics.getCounts());
      },
      onState: (update) => { if (!this.disposed) this.callbacks.onStreamState?.(update); },
    });
  }

  private composeSlot(): LogSlot<ComposeKey> {
    return new LogSlot<ComposeKey>({
      kind: 'composeLogs',
      same: (a, b) => a.project === b.project && a.service === b.service,
      itemId: k => (k.service ? `${k.project}:${k.service}` : k.project),
      open: (k, signal, { reconnect, cursor }) => {
        const since = reconnect ? cursor.sinceIso() : undefined;
        return this.composeClient.streamLogs(k.project, k.service ?? undefined, since ? MAX_LOG_LINES : 100, signal, since);
      },
      isRunning: k => this.store.isComposeTargetRunning(k.project, k.service),
      publish: (k, entries) => {
        if (!this.disposed) this.callbacks.onComposeLogs(k.project, k.service, entries.map(serializeLogEntry));
      },
      onState: (update) => { if (!this.disposed) this.callbacks.onStreamState?.(update); },
    });
  }

  private ensureStatsStream(containerId: string | null): void {
    if (containerId === this.statsContainerId) return;
    this.stopStatsStream();
    if (!containerId || this.disposed) return;

    this.statsContainerId = containerId;
    this.callbacks.onStatsChange({ containerId, stats: null, loading: true });
    const stream = new FollowStream<ContainerStats>({
      open: signal => this.client.streamStats(containerId, signal),
      onItem: (stats) => {
        if (this.disposed) return;
        this.statsCollector.push(containerId, stats);
        this.callbacks.onStatsChange({
          containerId,
          stats: serializeStats(stats),
          loading: false,
          cpuHistory: this.statsCollector.getCpuSeries(containerId),
          memoryHistory: this.statsCollector.getMemorySeries(containerId),
          networkRxRateHistory: this.statsCollector.getNetworkRxRateSeries(containerId),
          networkTxRateHistory: this.statsCollector.getNetworkTxRateSeries(containerId),
          blockReadRateHistory: this.statsCollector.getBlockReadRateSeries(containerId),
          blockWriteRateHistory: this.statsCollector.getBlockWriteRateSeries(containerId),
          logSeveritySeries: this.logSeverityTimeSeries.get(containerId)?.getDominantSeries(),
        });
      },
      isTargetRunning: () => this.store.isContainerRunning(containerId),
      onState: (state, message) => {
        if (!this.disposed) this.callbacks.onStreamState?.({ kind: 'stats', itemId: containerId, state, message });
      },
    });
    this.statsStream = stream;
    stream.start();
  }

  private stopStatsStream(): void {
    this.statsStream?.stop();
    this.statsStream = null;
    this.statsContainerId = null;
  }

  async selectContainer(containerId: string | null): Promise<void> {
    if (!containerId || this.disposed) return;
    await Promise.all([this.loadDetail('inspect', containerId), this.loadDetail('changes', containerId)]);
  }

  async loadDetail(kind: DetailKind, itemId: string, retry = false): Promise<void> {
    if (this.disposed) return;
    const key = `${kind}:${itemId}`;
    const pending = this.detailPending.get(key);
    // A retry must not adopt a request that started before whatever made it
    // stale (an invalidating event, a failure): run again once that one settles.
    if (pending) return retry ? pending.then(() => this.loadDetail(kind, itemId, true)) : pending;
    const run = async () => {
      this.callbacks.onDetailLoad?.({ kind, itemId, state: 'loading' });
      try {
        if (kind === 'inspect') {
          const value = (!retry && this.inspectedDetails.get(itemId)) || await this.client.getContainerDetails(itemId);
          if (this.disposed) return;
          this.inspectedDetails.set(itemId, value);
          this.callbacks.onDetailsLoaded(itemId, serializeDetails(value));
        } else if (kind === 'changes') {
          const value = (!retry && this.inspectedChanges.get(itemId)) || await this.client.getContainerChanges(itemId);
          if (this.disposed) return;
          this.inspectedChanges.set(itemId, value);
          this.callbacks.onChangesLoaded(itemId, value.map(serializeFilesystemChange));
        } else {
          const value = (!retry && this.inspectedLayers.get(itemId)) || await this.client.getImageHistory(itemId);
          if (this.disposed) return;
          this.inspectedLayers.set(itemId, value);
          this.callbacks.onLayersLoaded(itemId, value.map(serializeImageLayer));
        }
        this.callbacks.onDetailLoad?.({ kind, itemId, state: 'ready' });
      } catch (error) {
        if (!this.disposed) this.callbacks.onDetailLoad?.({ kind, itemId, state: 'error', message: errorMessage(error) });
      }
    };
    const task = run().finally(() => this.detailPending.delete(key));
    this.detailPending.set(key, task);
    return task;
  }

  retryStreams(): void {
    this.stopAllStreams();
    this.applyStreamDemand();
  }

  async selectImage(imageId: string | null): Promise<void> {
    if (imageId) await this.loadDetail('layers', imageId);
  }

  async selectComposeService(projectName: string, serviceName: string | null): Promise<void> {
    this.composeLogSlot.ensure({ project: projectName, service: serviceName });
  }

  // ─── Actions ─────────────────────────────────────────────────────

  async startContainer(id: string): Promise<void> {
    await this.client.startContainer(id);
    await this.refresh();
  }

  async stopContainer(id: string): Promise<void> {
    await this.client.stopContainer(id);
    await this.refresh();
  }

  async restartContainer(id: string): Promise<void> {
    await this.client.restartContainer(id);
    await this.refresh();
  }

  async pauseContainer(id: string): Promise<void> {
    await this.client.pauseContainer(id);
    await this.refresh();
  }

  async unpauseContainer(id: string): Promise<void> {
    await this.client.unpauseContainer(id);
    await this.refresh();
  }

  async removeContainer(id: string): Promise<void> {
    await this.client.removeContainer(id, true);
    await this.refresh();
  }

  async removeImage(id: string): Promise<void> {
    await this.client.removeImage(id);
    await this.refresh();
  }

  /** Returns the outcome detail so the toast can report reclaimed space. */
  /**
   * Remove all stopped containers — the cleanup the other three panels always
   * offered and this one did not.
   */
  async pruneContainers(): Promise<string> {
    const { containersDeleted, spaceReclaimed } = await this.client.pruneContainers();
    await this.refresh();
    const n = containersDeleted.length;
    return `Pruned ${n} container${n === 1 ? '' : 's'} \u2014 ${formatBytes(spaceReclaimed)} reclaimed`;
  }

  async pruneImages(): Promise<string> {
    const { spaceReclaimed } = await this.client.pruneImages();
    await this.refresh();
    return `Pruned images — ${formatBytes(spaceReclaimed)} reclaimed`;
  }

  async removeVolume(name: string): Promise<void> {
    await this.client.removeVolume(name);
    await this.refresh();
  }

  async pruneVolumes(): Promise<string> {
    const { spaceReclaimed } = await this.client.pruneVolumes();
    await this.refresh();
    return `Pruned volumes — ${formatBytes(spaceReclaimed)} reclaimed`;
  }

  async removeNetwork(id: string): Promise<void> {
    await this.client.removeNetwork(id);
    await this.refresh();
  }

  async pruneNetworks(): Promise<string> {
    const { networksDeleted } = await this.client.pruneNetworks();
    await this.refresh();
    const n = networksDeleted.length;
    return `Pruned ${n} network${n === 1 ? '' : 's'}`;
  }

  /**
   * Working directory for a compose action: prefer the source location
   * Docker recorded for the project (`com.docker.compose.project.working_dir`
   * / `.config_files` labels — correct regardless of workspace), falling
   * back to the injected workspace cwd. listContainers does not thread
   * labels through, so when detection could not capture the location we
   * inspect one of the project's containers to recover it.
   */
  private async composeCwd(projectName: string): Promise<ComposeCommandOptions> {
    const project = this.store.getSnapshot().composeProjects.find(p => p.name === projectName);
    let workingDir = project?.workingDir;
    let configFile = project?.configFile;
    let configFiles = project?.configFiles;

    if (!workingDir && !configFile) {
      const containerId = project?.services.find(s => s.containerId)?.containerId;
      if (containerId) {
        try {
          const info = await this.client.inspectContainer(containerId);
          ({ workingDir, configFile, configFiles } = ComposeDetector.projectSourceFromLabels(info.Config?.Labels));
        } catch {
          // Container vanished or inspect failed — fall back to the workspace cwd.
        }
      }
    }

    return resolveComposeOptions({ workingDir, configFile, configFiles }, this.cwd);
  }

  /**
   * Await a compose run and raise on a non-zero exit. The result carries
   * exitCode and stderr, but these call sites used to drop it — so a failed
   * `docker compose up` still surfaced as a success notification.
   */
  private async runCompose(action: string, exec: Promise<ComposeExecResult>): Promise<void> {
    throwIfComposeFailed(await exec, action);
    await this.refresh();
  }

  /**
   * Refuse compose in an untrusted workspace. Must be called *before* the
   * ComposeClient call — `runCompose` receives an already-invoked promise, so
   * a guard there would fire after the process had already spawned.
   */
  private assertComposeAllowed(action: string): void {
    if (this.isTrusted) return;
    throw new Error(
      `${action} is disabled in an untrusted workspace — running compose would execute this workspace's compose file. Trust the folder to enable it.`,
    );
  }

  async composeUp(projectName: string): Promise<void> {
    this.assertComposeAllowed('Up');
    await this.runCompose('Up', this.composeClient.up(projectName, await this.composeCwd(projectName)));
  }

  async composeDown(projectName: string): Promise<void> {
    this.assertComposeAllowed('Down');
    await this.runCompose('Down', this.composeClient.down(projectName, await this.composeCwd(projectName)));
  }

  async composeRestart(projectName: string, serviceName?: string): Promise<void> {
    this.assertComposeAllowed('Restart');
    await this.runCompose('Restart', this.composeClient.restart(projectName, serviceName, await this.composeCwd(projectName)));
  }

  async composeStop(projectName: string, serviceName?: string): Promise<void> {
    this.assertComposeAllowed('Stop');
    await this.runCompose('Stop', this.composeClient.stop(projectName, serviceName, await this.composeCwd(projectName)));
  }

  getContainerName(containerId: string): string | undefined {
    return this.store.getSnapshot().containers.find(c => c.id === containerId)?.name;
  }

  /** Human-readable name for an item, used in action feedback (progress/success/error). */
  getItemDisplayName(panelId: string, itemId: string): string {
    switch (panelId) {
      case 'containers':
        return this.getContainerName(itemId) ?? shortId(itemId);
      case 'images': {
        const image = this.store.getSnapshot().images.find(i => i.id === itemId);
        return image?.repoTags[0] ?? shortId(itemId);
      }
      case 'volumes':
        return itemId;
      case 'networks':
        return this.store.getSnapshot().networks.find(n => n.id === itemId)?.name ?? shortId(itemId);
      case 'services': {
        // itemId format: "project:projectName" or "service:projectName:serviceName"
        const parts = itemId.split(':');
        if (parts[0] === 'project') return parts.slice(1).join(':');
        if (parts[0] === 'service') return `${parts[1]}/${parts.slice(2).join(':')}`;
        return itemId;
      }
      default:
        return itemId;
    }
  }

  /** Explicit user refresh: also re-read the compose file even if it looks unchanged. */
  async forceRefresh(): Promise<void> {
    await this.store.refresh({ reloadCompose: true });
  }

  dispose(): void {
    this.disposed = true;
    this.stopAllStreams();
    this.statsSampler.dispose();
    this.store.dispose();
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.stopLiveInfrastructure();
    this.client.dispose();
  }
}

// ─── Serialization helpers ───────────────────────────────────────────

function serializeContainer(c: ContainerInfo): SerializedContainerInfo {
  // labels is optional upstream (the daemon may omit it); normalize here so
  // the webview never has to guard it.
  return { ...c, created: c.created.toISOString(), labels: c.labels ?? {} };
}

function serializeImage(i: ImageInfo): SerializedImageInfo {
  return { ...i, created: i.created.toISOString() };
}

function serializeVolume(v: VolumeInfo): SerializedVolumeInfo {
  return { ...v, created: v.created.toISOString() };
}

function serializeNetwork(n: NetworkInfo): SerializedNetworkInfo {
  return { ...n };
}

function serializeComposeProject(p: ComposeProject): SerializedComposeProject {
  return { ...p };
}

function serializeLogEntry(e: LogEntry): SerializedLogEntry {
  return { timestamp: e.timestamp?.toISOString() ?? null, stream: e.stream, message: e.message };
}

function serializeFilesystemChange(c: FilesystemChange): SerializedFilesystemChange {
  return { path: c.path, kind: c.kind };
}

function serializeDetails(d: ContainerDetails): SerializedContainerDetails {
  return {
    ...d,
    mounts: d.mounts.map(m => ({ ...m })),
    health: d.health ? { ...d.health, log: d.health.log.map(l => ({ ...l, start: l.start?.toISOString() ?? null })) } : null,
  };
}

function serializeImageLayer(l: ImageLayer): SerializedImageLayer {
  return {
    id: l.id,
    created: l.created.toISOString(),
    createdBy: l.createdBy,
    size: l.size,
    comment: l.comment,
  };
}

function serializeStats(s: ContainerStats): SerializedContainerStats {
  return {
    cpuPercent: s.cpuPercent,
    memoryUsage: s.memoryUsage,
    memoryLimit: s.memoryLimit,
    memoryPercent: s.memoryPercent,
    networkRx: s.networkRx,
    networkTx: s.networkTx,
    blockRead: s.blockRead,
    blockWrite: s.blockWrite,
    pids: s.pids,
  };
}

function needsLiveStats(sortField: DashboardViewState['sortField']): boolean {
  return sortField === 'cpu'
    || sortField === 'mem'
    || sortField === 'net'
    || sortField === 'io'
    || sortField === 'pids';
}
