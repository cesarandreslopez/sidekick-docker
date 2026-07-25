import {
  DockerClient,
  ComposeClient,
  ComposeDetector,
  ComposeFileReader,
  EventWatcher,
  ReconnectScheduler,
  StatsCollector,
  StatsSampler,
  MAX_LOG_LINES,
  shortId,
  throwIfComposeFailed,
  resolveComposeCwd,
  formatBytes,
} from 'sidekick-docker-shared';
import { LogAnalytics, LogSeverityTimeSeries, detectSeverity } from 'sidekick-docker-shared/log';
import type {
  ContainerInfo,
  DockerClientOptions,
  ImageInfo,
  ImageLayer,
  FilesystemChange,
  VolumeInfo,
  NetworkInfo,
  ComposeProject,
  LogEntry,
  ContainerStats,
  ComposeFileConfig,
  ComposeExecResult,
  SeverityCounts,
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
  onEnvLoaded: (containerId: string, env: string[]) => void;
  onChangesLoaded: (containerId: string, changes: SerializedFilesystemChange[]) => void;
  onLayersLoaded: (imageId: string, layers: SerializedImageLayer[]) => void;
  onError: (message: string) => void;
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
}

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
  private composeDetector = new ComposeDetector();
  private composeFileReader = new ComposeFileReader();
  private statsCollector = new StatsCollector();
  /**
   * Fills in stats for every row when the list needs them (a stats-based sort).
   * The single stats *stream* only ever covers the selected container.
   */
  private statsSampler: StatsSampler;
  private watcher: EventWatcher | null = null;

  private containers: ContainerInfo[] = [];
  private images: ImageInfo[] = [];
  private volumes: VolumeInfo[] = [];
  private networks: NetworkInfo[] = [];
  private composeProjects: ComposeProject[] = [];
  private cachedFileConfig: ComposeFileConfig | null = null;
  private daemonConnected = false;
  private lastRefresh: Date | null = null;
  private inspectedEnv = new Map<string, string[]>();
  private inspectedChanges = new Map<string, FilesystemChange[]>();
  private inspectedLayers = new Map<string, ImageLayer[]>();

  // Log streaming
  private logContainerId: string | null = null;
  private logAborted = false;
  private logs: LogEntry[] = [];
  private logSeverityTimeSeries = new Map<string, LogSeverityTimeSeries>();
  private logFlushTimer: ReturnType<typeof setTimeout> | null = null;

  // Stats streaming
  private statsContainerId: string | null = null;
  private statsAborted = false;

  /**
   * Backoff state per stream. The CLI's stream managers get reconnection from
   * BaseStreamManager; these loops had none, so a container restart ended the
   * stream for good and the pane silently stopped updating until the user
   * reselected it.
   */
  private logReconnect = new ReconnectScheduler();
  private statsReconnect = new ReconnectScheduler();
  private composeLogReconnect = new ReconnectScheduler();
  private secondaryLogReconnect = new ReconnectScheduler();
  private secondaryComposeLogReconnect = new ReconnectScheduler();

  // Compose log streaming
  private composeLogProject: string | null = null;
  private composeLogService: string | null = null;
  private composeLogAborted = false;
  private composeLogs: LogEntry[] = [];
  private composeLogFlushTimer: ReturnType<typeof setTimeout> | null = null;

  // Secondary log streaming (compare mode)
  private secondaryLogContainerId: string | null = null;
  private secondaryLogAborted = false;
  private secondaryLogs: LogEntry[] = [];
  private secondaryLogFlushTimer: ReturnType<typeof setTimeout> | null = null;

  // Secondary compose log streaming (compare mode)
  private secondaryComposeLogProject: string | null = null;
  private secondaryComposeLogService: string | null = null;
  private secondaryComposeLogAborted = false;
  private secondaryComposeLogs: LogEntry[] = [];
  private secondaryComposeLogFlushTimer: ReturnType<typeof setTimeout> | null = null;

  private refreshInterval: ReturnType<typeof setInterval> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private callbacks: DockerServiceCallbacks;
  private disposed = false;
  private cwd: string | undefined;
  private isTrusted: boolean;
  private refreshIntervalMs: number;
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
    this.isTrusted = options?.isTrusted ?? true;
    this.refreshIntervalMs = options?.refreshIntervalMs ?? 30_000;
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

  async initialize(): Promise<boolean> {
    const ok = await this.client.ping();
    if (!ok) return false;

    await this.refresh();
    this.initialized = true;
    if (this.viewState.visible) {
      this.startLiveInfrastructure();
    }
    this.applyStreamDemand();
    return true;
  }

  setViewState(next: Partial<DashboardViewState>): void {
    this.viewState = { ...this.viewState, ...next };
    this.applyStreamDemand();
  }

  async setVisible(visible: boolean): Promise<void> {
    if (this.viewState.visible === visible) return;
    this.viewState = { ...this.viewState, visible };

    if (!this.initialized || this.disposed) return;

    if (!visible) {
      this.stopLiveInfrastructure();
      this.stopLogStream();
      this.stopStatsStream();
      this.stopComposeLogStream();
      this.stopSecondaryLogStream();
      this.stopSecondaryComposeLogStream();
      this.statsSampler.setIds([]);
      return;
    }

    await this.refresh();
    this.callbacks.onStateChange(this.getStateSnapshot());
    this.startLiveInfrastructure();
    this.applyStreamDemand();
  }

  private startLiveInfrastructure(): void {
    if (this.disposed) return;

    if (!this.watcher) {
      this.watcher = new EventWatcher(this.client, {
        onEvent: (event) => {
          this.processEvent(event);
          this.scheduleStateUpdate();
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

  private async refresh(): Promise<void> {
    try {
      const [containers, images, volumes, networks, fileConfig] = await Promise.all([
        this.client.listContainers(true),
        this.client.listImages(),
        this.client.listVolumes(),
        this.client.listNetworks(),
        this.cwd ? this.composeFileReader.readFromDirectory(this.cwd).catch(() => null) : Promise.resolve(null),
      ]);

      this.containers = containers;
      this.images = images;
      this.volumes = volumes;
      this.networks = networks;
      this.cachedFileConfig = fileConfig;
      this.composeProjects = this.composeDetector.detect(containers, fileConfig);
      this.lastRefresh = new Date();
      this.daemonConnected = true;

      // The sampler's id set is derived from this.containers, so it has to be
      // re-derived whenever the list changes. Driving it only from
      // setViewState left containers started after a stats sort was applied
      // permanently unsampled, i.e. sorting as zero.
      if (this.initialized) this.applyStreamDemand();
    } catch {
      this.daemonConnected = false;
    }
  }

  private processEvent(event: { type: string; resourceType: string; resourceId: string; attributes: Record<string, string> }): void {
    switch (event.resourceType) {
      case 'container':
        this.handleContainerEvent(event);
        break;
      default:
        this.refresh().catch(e => console.debug('refresh failed:', e));
        break;
    }
  }

  private handleContainerEvent(event: { type: string; resourceId: string; attributes: Record<string, string> }): void {
    switch (event.type) {
      case 'start':
      case 'unpause': {
        const existing = this.containers.find(c => c.id === event.resourceId);
        if (existing) {
          existing.state = 'running';
          existing.status = 'Up just now';
        }
        this.refresh().catch(e => console.debug('refresh failed:', e));
        break;
      }
      case 'stop':
      case 'die': {
        const existing = this.containers.find(c => c.id === event.resourceId);
        if (existing) {
          existing.state = 'exited';
          existing.status = 'Exited';
        }
        break;
      }
      case 'pause': {
        const existing = this.containers.find(c => c.id === event.resourceId);
        if (existing) existing.state = 'paused';
        break;
      }
      case 'destroy':
        this.containers = this.containers.filter(c => c.id !== event.resourceId);
        this.statsCollector.remove(event.resourceId);
        break;
      default:
        this.refresh().catch(e => console.debug('refresh failed:', e));
        break;
    }
    this.composeProjects = this.composeDetector.detect(this.containers, this.cachedFileConfig);
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
    return {
      containers: this.containers.map(serializeContainer),
      images: this.images.map(serializeImage),
      volumes: this.volumes.map(serializeVolume),
      networks: this.networks.map(serializeNetwork),
      composeProjects: this.composeProjects.map(serializeComposeProject),
      daemonConnected: this.daemonConnected,
      lastRefresh: this.lastRefresh?.toISOString() ?? null,
    };
  }

  // ─── View-driven streaming ──────────────────────────────────────

  private applyStreamDemand(): void {
    if (!this.initialized || this.disposed || !this.viewState.visible) {
      this.stopLogStream();
      this.stopStatsStream();
      this.stopComposeLogStream();
      this.stopSecondaryLogStream();
      this.stopSecondaryComposeLogStream();
      // The sampler is not a stream, so it survives the stopXStream calls. Left
      // running it polls one request per running container every 3s behind a
      // dashboard nobody is looking at.
      this.statsSampler.setIds([]);
      return;
    }

    const selectedItemId = this.viewState.selectedItemId;
    const wantsContainerLogs = this.viewState.activePanelId === 'containers'
      && this.viewState.detailTabIndex === 0
      && selectedItemId !== null;
    const wantsContainerStats = this.viewState.activePanelId === 'containers'
      && selectedItemId !== null
      && (this.viewState.detailTabIndex === 1 || needsLiveStats(this.viewState.sortField));
    const wantsComposeLogs = this.viewState.activePanelId === 'services'
      && this.viewState.detailTabIndex === 1
      && this.viewState.composeProjectName !== null;

    // Secondary compare streams: only when on Logs tab and a compare item is pinned
    const wantsSecondaryContainerLogs = wantsContainerLogs && this.viewState.compareItemId !== null;
    const wantsSecondaryComposeLogs = wantsComposeLogs && this.viewState.compareComposeProjectName !== null;

    // Sorting compares every row, so it needs a sample per container — not just
    // the selected one. Running containers only; stopped ones report zeros.
    this.statsSampler.setIds(
      this.viewState.activePanelId === 'containers' && needsLiveStats(this.viewState.sortField)
        // Skip whichever container has a live stream: it already produces
        // richer updates (with history series), and sampling it too would both
        // duplicate the request and race the stream's own values.
        ? this.containers
            .filter(c => c.state === 'running' && c.id !== this.statsContainerId)
            .map(c => c.id)
        : [],
    );

    this.ensureLogStream(wantsContainerLogs ? selectedItemId : null);
    this.ensureStatsStream(wantsContainerStats ? selectedItemId : null);
    this.ensureComposeLogStream(
      wantsComposeLogs ? this.viewState.composeProjectName : null,
      wantsComposeLogs ? this.viewState.composeServiceName : null,
    );
    this.ensureSecondaryLogStream(wantsSecondaryContainerLogs ? this.viewState.compareItemId : null);
    this.ensureSecondaryComposeLogStream(
      wantsSecondaryComposeLogs ? this.viewState.compareComposeProjectName : null,
      wantsSecondaryComposeLogs ? this.viewState.compareComposeServiceName : null,
    );
  }

  private ensureLogStream(containerId: string | null): void {
    if (containerId === this.logContainerId) return;
    this.stopLogStream();
    if (!containerId) return;

    this.logContainerId = containerId;
    this.logAborted = false;
    this.logs = [];
    void this.streamLogs(containerId);
  }

  private ensureStatsStream(containerId: string | null): void {
    if (containerId === this.statsContainerId) return;
    this.stopStatsStream();
    if (!containerId) return;

    this.statsContainerId = containerId;
    this.statsAborted = false;
    if (!this.disposed) {
      this.callbacks.onStatsChange({ containerId, stats: null, loading: true });
    }
    void this.streamStats(containerId);
  }

  private ensureComposeLogStream(projectName: string | null, serviceName: string | null): void {
    if (projectName === this.composeLogProject && serviceName === this.composeLogService) return;
    this.stopComposeLogStream();
    if (!projectName) return;

    this.composeLogProject = projectName;
    this.composeLogService = serviceName;
    this.composeLogAborted = false;
    this.composeLogs = [];
    void this.streamComposeLogs(projectName, serviceName);
  }

  async selectContainer(containerId: string | null): Promise<void> {
    if (!containerId) return;

    // Fetch env vars
    if (!this.inspectedEnv.has(containerId)) {
      try {
        const env = await this.client.getContainerEnv(containerId);
        this.inspectedEnv.set(containerId, env);
        if (!this.disposed) {
          this.callbacks.onEnvLoaded(containerId, env);
        }
      } catch { /* ignore */ }
    } else {
      this.callbacks.onEnvLoaded(containerId, this.inspectedEnv.get(containerId)!);
    }

    // Fetch filesystem changes
    if (!this.inspectedChanges.has(containerId)) {
      try {
        const changes = await this.client.getContainerChanges(containerId);
        this.inspectedChanges.set(containerId, changes);
        if (!this.disposed) {
          this.callbacks.onChangesLoaded(containerId, changes.map(serializeFilesystemChange));
        }
      } catch { /* ignore */ }
    } else {
      this.callbacks.onChangesLoaded(containerId, this.inspectedChanges.get(containerId)!.map(serializeFilesystemChange));
    }
  }

  /**
   * Restart a stream that ended while its target is still selected.
   *
   * A stream ends for two very different reasons: the user moved away (in
   * which case `stillWanted` is false and we must not resurrect it), or the
   * container restarted / the daemon hiccuped (in which case the pane should
   * recover on its own). Backoff is capped, so a container that never comes
   * back stops being retried instead of spinning.
   */
  private reconnectStream(
    scheduler: ReconnectScheduler,
    stillWanted: () => boolean,
    restart: () => void,
  ): void {
    if (this.disposed || !stillWanted()) {
      scheduler.clear();
      return;
    }
    scheduler.schedule(() => {
      if (this.disposed || !stillWanted()) return;
      restart();
    });
  }

  private async streamLogs(containerId: string): Promise<void> {
    // Ensure severity tracking exists for this container
    if (!this.logSeverityTimeSeries.has(containerId)) {
      this.logSeverityTimeSeries.set(containerId, new LogSeverityTimeSeries());
    }
    const timeSeries = this.logSeverityTimeSeries.get(containerId)!;

    try {
      for await (const entry of this.client.streamLogs(containerId, { follow: true, tail: 100 })) {
        if (this.logAborted || this.logContainerId !== containerId) break;
        this.logs.push(entry);
        if (this.logs.length > MAX_LOG_LINES) this.logs.shift();

        // Track severity for time-series sparkline
        const severity = detectSeverity(entry.message);
        timeSeries.push(severity);
        this.scheduleLogFlush(containerId);
      }
      this.flushLogs(containerId);
      // A stream that ran to completion clears the backoff. Without this the
      // delay doubles on every container restart and, after MAX_RECONNECT_ATTEMPTS,
      // schedule() refuses outright — so "streams recover after a restart"
      // silently stops being true for the rest of the selection.
      this.logReconnect.reset();
    } catch { /* stream ended or errored */ }
    this.reconnectStream(
      this.logReconnect,
      () => !this.logAborted && this.logContainerId === containerId,
      () => { void this.streamLogs(containerId); },
    );
  }

  private async streamStats(containerId: string): Promise<void> {
    try {
      for await (const stats of this.client.streamStats(containerId)) {
        if (this.statsAborted || this.statsContainerId !== containerId) break;
        this.statsCollector.push(containerId, stats);
        if (!this.disposed) {
          const cpuHistory = this.statsCollector.getCpuSeries(containerId);
          const memoryHistory = this.statsCollector.getMemorySeries(containerId);
          const networkRxRateHistory = this.statsCollector.getNetworkRxRateSeries(containerId);
          const networkTxRateHistory = this.statsCollector.getNetworkTxRateSeries(containerId);
          const blockReadRateHistory = this.statsCollector.getBlockReadRateSeries(containerId);
          const blockWriteRateHistory = this.statsCollector.getBlockWriteRateSeries(containerId);
          const logSeveritySeries = this.logSeverityTimeSeries.get(containerId)?.getDominantSeries();
          this.callbacks.onStatsChange({
            containerId,
            stats: serializeStats(stats),
            loading: false,
            cpuHistory,
            memoryHistory,
            networkRxRateHistory,
            networkTxRateHistory,
            blockReadRateHistory,
            blockWriteRateHistory,
            logSeveritySeries,
          });
        }
      }
      this.statsReconnect.reset();
    } catch { /* stream ended or errored */ }
    this.reconnectStream(
      this.statsReconnect,
      () => !this.statsAborted && this.statsContainerId === containerId,
      () => { void this.streamStats(containerId); },
    );
  }

  private stopLogStream(): void {
    this.logReconnect.clear();
    this.logReconnect.reset();
    if (this.logContainerId) {
      this.flushLogs(this.logContainerId);
    }
    this.logAborted = true;
    this.logContainerId = null;
    this.logs = [];
    if (this.logFlushTimer) {
      clearTimeout(this.logFlushTimer);
      this.logFlushTimer = null;
    }
  }

  private stopStatsStream(): void {
    this.statsReconnect.clear();
    this.statsReconnect.reset();
    this.statsAborted = true;
    this.statsContainerId = null;
  }

  async selectImage(imageId: string | null): Promise<void> {
    if (!imageId) return;

    if (!this.inspectedLayers.has(imageId)) {
      try {
        const layers = await this.client.getImageHistory(imageId);
        this.inspectedLayers.set(imageId, layers);
        if (!this.disposed) {
          this.callbacks.onLayersLoaded(imageId, layers.map(serializeImageLayer));
        }
      } catch { /* ignore */ }
    } else {
      this.callbacks.onLayersLoaded(imageId, this.inspectedLayers.get(imageId)!.map(serializeImageLayer));
    }
  }

  // ─── Compose log streaming ────────────────────────────────────────

  async selectComposeService(projectName: string, serviceName: string | null): Promise<void> {
    this.ensureComposeLogStream(projectName, serviceName);
  }

  private async streamComposeLogs(projectName: string, serviceName: string | null): Promise<void> {
    try {
      for await (const entry of this.composeClient.streamLogs(projectName, serviceName ?? undefined)) {
        if (this.composeLogAborted || this.composeLogProject !== projectName) break;
        this.composeLogs.push(entry);
        if (this.composeLogs.length > MAX_LOG_LINES) this.composeLogs.shift();
        this.scheduleComposeLogFlush(projectName, serviceName);
      }
      this.flushComposeLogs(projectName, serviceName);
      this.composeLogReconnect.reset();
    } catch { /* stream ended or errored */ }
    this.reconnectStream(
      this.composeLogReconnect,
      () => !this.composeLogAborted
        && this.composeLogProject === projectName
        && this.composeLogService === serviceName,
      () => { void this.streamComposeLogs(projectName, serviceName); },
    );
  }

  private stopComposeLogStream(): void {
    this.composeLogReconnect.clear();
    this.composeLogReconnect.reset();
    if (this.composeLogProject) {
      this.flushComposeLogs(this.composeLogProject, this.composeLogService);
    }
    this.composeLogAborted = true;
    this.composeLogProject = null;
    this.composeLogService = null;
    this.composeLogs = [];
    if (this.composeLogFlushTimer) {
      clearTimeout(this.composeLogFlushTimer);
      this.composeLogFlushTimer = null;
    }
  }

  // ─── Secondary log streaming (compare mode) ──────────────────────

  private ensureSecondaryLogStream(containerId: string | null): void {
    if (containerId === this.secondaryLogContainerId) return;
    this.stopSecondaryLogStream();
    if (!containerId) return;

    this.secondaryLogContainerId = containerId;
    this.secondaryLogAborted = false;
    this.secondaryLogs = [];
    void this.streamSecondaryLogs(containerId);
  }

  private async streamSecondaryLogs(containerId: string): Promise<void> {
    try {
      for await (const entry of this.client.streamLogs(containerId, { follow: true, tail: 100 })) {
        if (this.secondaryLogAborted || this.secondaryLogContainerId !== containerId) break;
        this.secondaryLogs.push(entry);
        if (this.secondaryLogs.length > MAX_LOG_LINES) this.secondaryLogs.shift();
        this.scheduleSecondaryLogFlush(containerId);
      }
      this.flushSecondaryLogs(containerId);
      this.secondaryLogReconnect.reset();
    } catch { /* stream ended or errored */ }
    this.reconnectStream(
      this.secondaryLogReconnect,
      () => !this.secondaryLogAborted && this.secondaryLogContainerId === containerId,
      () => { void this.streamSecondaryLogs(containerId); },
    );
  }

  private stopSecondaryLogStream(): void {
    this.secondaryLogReconnect.clear();
    this.secondaryLogReconnect.reset();
    if (this.secondaryLogContainerId) {
      this.flushSecondaryLogs(this.secondaryLogContainerId);
    }
    this.secondaryLogAborted = true;
    this.secondaryLogContainerId = null;
    this.secondaryLogs = [];
    if (this.secondaryLogFlushTimer) {
      clearTimeout(this.secondaryLogFlushTimer);
      this.secondaryLogFlushTimer = null;
    }
  }

  private scheduleSecondaryLogFlush(containerId: string): void {
    if (this.secondaryLogFlushTimer || this.disposed) return;
    this.secondaryLogFlushTimer = setTimeout(() => {
      this.secondaryLogFlushTimer = null;
      this.flushSecondaryLogs(containerId);
    }, 100);
  }

  private flushSecondaryLogs(containerId: string): void {
    if (this.disposed || this.secondaryLogContainerId !== containerId) return;
    const analytics = new LogAnalytics();
    for (const entry of this.secondaryLogs) {
      analytics.push(entry.message);
    }
    // Reuse the same onLogsChange callback — secondary logs land in the webview's
    // logs map under the compare container's ID, just like primary logs.
    this.callbacks.onLogsChange(
      containerId,
      this.secondaryLogs.map(serializeLogEntry),
      analytics.getCounts(),
    );
  }

  private ensureSecondaryComposeLogStream(projectName: string | null, serviceName: string | null): void {
    if (projectName === this.secondaryComposeLogProject && serviceName === this.secondaryComposeLogService) return;
    this.stopSecondaryComposeLogStream();
    if (!projectName) return;

    this.secondaryComposeLogProject = projectName;
    this.secondaryComposeLogService = serviceName;
    this.secondaryComposeLogAborted = false;
    this.secondaryComposeLogs = [];
    void this.streamSecondaryComposeLogs(projectName, serviceName);
  }

  private async streamSecondaryComposeLogs(projectName: string, serviceName: string | null): Promise<void> {
    try {
      for await (const entry of this.composeClient.streamLogs(projectName, serviceName ?? undefined)) {
        if (this.secondaryComposeLogAborted || this.secondaryComposeLogProject !== projectName) break;
        this.secondaryComposeLogs.push(entry);
        if (this.secondaryComposeLogs.length > MAX_LOG_LINES) this.secondaryComposeLogs.shift();
        this.scheduleSecondaryComposeLogFlush(projectName, serviceName);
      }
      this.flushSecondaryComposeLogs(projectName, serviceName);
      this.secondaryComposeLogReconnect.reset();
    } catch { /* stream ended or errored */ }
    this.reconnectStream(
      this.secondaryComposeLogReconnect,
      () => !this.secondaryComposeLogAborted
        && this.secondaryComposeLogProject === projectName
        && this.secondaryComposeLogService === serviceName,
      () => { void this.streamSecondaryComposeLogs(projectName, serviceName); },
    );
  }

  private stopSecondaryComposeLogStream(): void {
    this.secondaryComposeLogReconnect.clear();
    this.secondaryComposeLogReconnect.reset();
    if (this.secondaryComposeLogProject) {
      this.flushSecondaryComposeLogs(this.secondaryComposeLogProject, this.secondaryComposeLogService);
    }
    this.secondaryComposeLogAborted = true;
    this.secondaryComposeLogProject = null;
    this.secondaryComposeLogService = null;
    this.secondaryComposeLogs = [];
    if (this.secondaryComposeLogFlushTimer) {
      clearTimeout(this.secondaryComposeLogFlushTimer);
      this.secondaryComposeLogFlushTimer = null;
    }
  }

  private scheduleSecondaryComposeLogFlush(projectName: string, serviceName: string | null): void {
    if (this.secondaryComposeLogFlushTimer || this.disposed) return;
    this.secondaryComposeLogFlushTimer = setTimeout(() => {
      this.secondaryComposeLogFlushTimer = null;
      this.flushSecondaryComposeLogs(projectName, serviceName);
    }, 100);
  }

  private flushSecondaryComposeLogs(projectName: string, serviceName: string | null): void {
    if (this.disposed || this.secondaryComposeLogProject !== projectName || this.secondaryComposeLogService !== serviceName) return;
    this.callbacks.onComposeLogs(
      projectName,
      serviceName,
      this.secondaryComposeLogs.map(serializeLogEntry),
    );
  }

  private scheduleLogFlush(containerId: string): void {
    if (this.logFlushTimer || this.disposed) return;
    this.logFlushTimer = setTimeout(() => {
      this.logFlushTimer = null;
      this.flushLogs(containerId);
    }, 100);
  }

  private flushLogs(containerId: string): void {
    if (this.disposed || this.logContainerId !== containerId) return;
    const analytics = new LogAnalytics();
    for (const entry of this.logs) {
      analytics.push(entry.message);
    }
    this.callbacks.onLogsChange(
      containerId,
      this.logs.map(serializeLogEntry),
      analytics.getCounts(),
    );
  }

  private scheduleComposeLogFlush(projectName: string, serviceName: string | null): void {
    if (this.composeLogFlushTimer || this.disposed) return;
    this.composeLogFlushTimer = setTimeout(() => {
      this.composeLogFlushTimer = null;
      this.flushComposeLogs(projectName, serviceName);
    }, 100);
  }

  private flushComposeLogs(projectName: string, serviceName: string | null): void {
    if (this.disposed || this.composeLogProject !== projectName || this.composeLogService !== serviceName) return;
    this.callbacks.onComposeLogs(
      projectName,
      serviceName,
      this.composeLogs.map(serializeLogEntry),
    );
  }

  // ─── Actions ─────────────────────────────────────────────────────

  async startContainer(id: string): Promise<void> {
    await this.client.startContainer(id);
    await this.refresh();
    this.scheduleStateUpdate();
  }

  async stopContainer(id: string): Promise<void> {
    await this.client.stopContainer(id);
    await this.refresh();
    this.scheduleStateUpdate();
  }

  async restartContainer(id: string): Promise<void> {
    await this.client.restartContainer(id);
    await this.refresh();
    this.scheduleStateUpdate();
  }

  async pauseContainer(id: string): Promise<void> {
    await this.client.pauseContainer(id);
    await this.refresh();
    this.scheduleStateUpdate();
  }

  async unpauseContainer(id: string): Promise<void> {
    await this.client.unpauseContainer(id);
    await this.refresh();
    this.scheduleStateUpdate();
  }

  async removeContainer(id: string): Promise<void> {
    await this.client.removeContainer(id, true);
    await this.refresh();
    this.scheduleStateUpdate();
  }

  async removeImage(id: string): Promise<void> {
    await this.client.removeImage(id);
    await this.refresh();
    this.scheduleStateUpdate();
  }

  /** Returns the outcome detail so the toast can report reclaimed space. */
  /**
   * Remove all stopped containers — the cleanup the other three panels always
   * offered and this one did not.
   */
  async pruneContainers(): Promise<string> {
    const { containersDeleted, spaceReclaimed } = await this.client.pruneContainers();
    await this.refresh();
    this.scheduleStateUpdate();
    const n = containersDeleted.length;
    return `Pruned ${n} container${n === 1 ? '' : 's'} \u2014 ${formatBytes(spaceReclaimed)} reclaimed`;
  }

  async pruneImages(): Promise<string> {
    const { spaceReclaimed } = await this.client.pruneImages();
    await this.refresh();
    this.scheduleStateUpdate();
    return `Pruned images — ${formatBytes(spaceReclaimed)} reclaimed`;
  }

  async removeVolume(name: string): Promise<void> {
    await this.client.removeVolume(name);
    await this.refresh();
    this.scheduleStateUpdate();
  }

  async pruneVolumes(): Promise<string> {
    const { spaceReclaimed } = await this.client.pruneVolumes();
    await this.refresh();
    this.scheduleStateUpdate();
    return `Pruned volumes — ${formatBytes(spaceReclaimed)} reclaimed`;
  }

  async removeNetwork(id: string): Promise<void> {
    await this.client.removeNetwork(id);
    await this.refresh();
    this.scheduleStateUpdate();
  }

  async pruneNetworks(): Promise<string> {
    const { networksDeleted } = await this.client.pruneNetworks();
    await this.refresh();
    this.scheduleStateUpdate();
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
  private async composeCwd(projectName: string): Promise<string | undefined> {
    const project = this.composeProjects.find(p => p.name === projectName);
    let workingDir = project?.workingDir;
    let configFile = project?.configFile;

    if (!workingDir && !configFile) {
      const containerId = project?.services.find(s => s.containerId)?.containerId;
      if (containerId) {
        try {
          const info = await this.client.inspectContainer(containerId);
          ({ workingDir, configFile } = ComposeDetector.projectSourceFromLabels(info.Config?.Labels));
        } catch {
          // Container vanished or inspect failed — fall back to the workspace cwd.
        }
      }
    }

    return resolveComposeCwd({ workingDir, configFile }, this.cwd);
  }

  /**
   * Await a compose run and raise on a non-zero exit. The result carries
   * exitCode and stderr, but these call sites used to drop it — so a failed
   * `docker compose up` still surfaced as a success notification.
   */
  private async runCompose(action: string, exec: Promise<ComposeExecResult>): Promise<void> {
    throwIfComposeFailed(await exec, action);
    await this.refresh();
    this.scheduleStateUpdate();
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
    return this.containers.find(c => c.id === containerId)?.name;
  }

  /** Human-readable name for an item, used in action feedback (progress/success/error). */
  getItemDisplayName(panelId: string, itemId: string): string {
    switch (panelId) {
      case 'containers':
        return this.getContainerName(itemId) ?? shortId(itemId);
      case 'images': {
        const image = this.images.find(i => i.id === itemId);
        return image?.repoTags[0] ?? shortId(itemId);
      }
      case 'volumes':
        return itemId;
      case 'networks':
        return this.networks.find(n => n.id === itemId)?.name ?? shortId(itemId);
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

  async forceRefresh(): Promise<void> {
    await this.refresh();
    this.scheduleStateUpdate();
  }

  dispose(): void {
    this.disposed = true;
    this.stopLogStream();
    this.stopStatsStream();
    this.statsSampler.dispose();
    this.stopComposeLogStream();
    this.stopSecondaryLogStream();
    this.stopSecondaryComposeLogStream();
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
