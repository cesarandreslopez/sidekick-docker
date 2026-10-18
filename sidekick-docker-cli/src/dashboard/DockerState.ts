import type {
  ContainerInfo,
  ImageInfo,
  ImageLayer,
  FilesystemChange,
  VolumeInfo,
  NetworkInfo,
  ComposeProject,
  DockerEvent,
  StoreChange,
  ComposeConfigSource,
} from 'sidekick-docker-shared';
import { DockerClient, DockerStateStore, StatsCollector, MAX_LOG_LINES } from 'sidekick-docker-shared';
import type { LogEntry, FilterMode, SeverityCounts, SeverityLevel, LogTemplate } from 'sidekick-docker-shared';
import { debugLog } from '../utils/debug';

export interface DockerDashboardMetrics {
  containers: ContainerInfo[];
  images: ImageInfo[];
  volumes: VolumeInfo[];
  networks: NetworkInfo[];
  composeProjects: ComposeProject[];
  statsCollector: StatsCollector;
  inspectedEnv: Map<string, string[]>;
  containerChanges: Map<string, FilesystemChange[]>;
  imageLayers: Map<string, ImageLayer[]>;
  /** Why a detail-tab fetch failed, keyed `${kind}:${id}`. See DockerState.detailErrorKey. */
  detailErrors: Map<string, string>;
  selectedContainerLogs: LogEntry[];
  selectedComposeLogs: LogEntry[];
  secondaryContainerLogs: LogEntry[];
  secondaryComposeLogs: LogEntry[];
  lastRefresh: Date | null;
  daemonConnected: boolean;
  resourceErrors?: Record<string, string>;
  logFilterString: string;
  logFilterMode: FilterMode;
  logSeverityCounts: SeverityCounts | null;
  logSeverityTimeSeries: { severity: SeverityLevel; total: number }[];
  logTemplates: LogTemplate[];
  secondaryLogSeverityCounts: SeverityCounts | null;
  secondaryLogSeverityTimeSeries: { severity: SeverityLevel; total: number }[];
}

export interface DockerStateOptions {
  /** Endpoint overrides for spawned `docker compose` (see `dockerCliEnv`). */
  cliEnv?: Record<string, string>;
  composeReader?: ComposeConfigSource;
}

/**
 * The TUI's view of Docker: the shared {@link DockerStateStore} for domain
 * state (refresh + event policy), plus the TUI-only buffers — log rings, lazy
 * detail caches, and the stats collector.
 */
export class DockerState {
  private store: DockerStateStore;
  private statsCollector = new StatsCollector();

  private selectedLogs: LogEntry[] = [];
  private selectedComposeLogs: LogEntry[] = [];
  private secondaryLogs: LogEntry[] = [];
  private secondaryComposeLogs: LogEntry[] = [];
  private inspectedEnv = new Map<string, string[]>();
  private containerChanges = new Map<string, FilesystemChange[]>();
  private imageLayers = new Map<string, ImageLayer[]>();
  /**
   * Failures from the lazy per-tab fetches (env, filesystem changes, image
   * layers). These used to be swallowed into console.debug, which left the
   * pane reading "Loading…" forever with no indication anything went wrong.
   */
  private detailErrors = new Map<string, string>();

  constructor(client: DockerClient, cwd?: string, private onChange?: () => void, options: DockerStateOptions = {}) {
    this.store = new DockerStateStore({
      client,
      cwd,
      cliEnv: options.cliEnv,
      composeReader: options.composeReader,
      onChange: change => this.onStoreChange(change),
      log: (msg, err) => debugLog(msg, err ?? ''),
    });
  }

  private onStoreChange(change: StoreChange): void {
    const snapshot = this.store.getSnapshot();
    if (change.cause === 'refresh') {
      // Drop cached details (and their errors) for containers/images that are gone.
      const containerIds = new Set(snapshot.containers.map(c => c.id));
      const imageIds = new Set(snapshot.images.map(i => i.id));
      for (const map of [this.inspectedEnv, this.containerChanges]) {
        for (const id of map.keys()) if (!containerIds.has(id)) map.delete(id);
      }
      for (const id of this.imageLayers.keys()) if (!imageIds.has(id)) this.imageLayers.delete(id);
      for (const key of this.detailErrors.keys()) {
        const [kind, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
        if (!(kind === 'layers' ? imageIds : containerIds).has(id)) this.detailErrors.delete(key);
      }
      this.statsCollector.prune(new Set(this.store.getRunningContainerIds()));
    }
    for (const id of change.removedContainerIds) {
      this.statsCollector.remove(id);
      this.inspectedEnv.delete(id);
      this.containerChanges.delete(id);
      this.detailErrors.delete(DockerState.detailErrorKey('env', id));
      this.detailErrors.delete(DockerState.detailErrorKey('changes', id));
    }
    this.onChange?.();
  }

  dispose(): void {
    this.store.dispose();
    this.inspectedEnv.clear();
    this.containerChanges.clear();
    this.imageLayers.clear();
    this.detailErrors.clear();
  }

  /** Fetch everything now; resolves once fresh data has committed. */
  refresh(opts: { reloadCompose?: boolean } = {}): Promise<void> {
    return this.store.refresh(opts);
  }

  processEvent(event: DockerEvent): void {
    this.store.processEvent(event);
  }

  /** `undefined` when the container is unknown. */
  isContainerRunning(id: string): boolean | undefined {
    return this.store.isContainerRunning(id);
  }

  isComposeTargetRunning(project: string, service: string | null): boolean | undefined {
    return this.store.isComposeTargetRunning(project, service);
  }

  setSelectedLogs(logs: LogEntry[]): void {
    this.selectedLogs = logs;
  }

  appendLog(entry: LogEntry): void {
    this.selectedLogs.push(entry);
    if (this.selectedLogs.length > MAX_LOG_LINES) {
      this.selectedLogs.shift();
    }
  }

  clearLogs(): void {
    this.selectedLogs = [];
  }

  appendComposeLog(entry: LogEntry): void {
    this.selectedComposeLogs.push(entry);
    if (this.selectedComposeLogs.length > MAX_LOG_LINES) {
      this.selectedComposeLogs.shift();
    }
  }

  clearComposeLogs(): void {
    this.selectedComposeLogs = [];
  }

  setSecondaryLogs(logs: LogEntry[]): void {
    this.secondaryLogs = logs;
  }

  clearSecondaryLogs(): void {
    this.secondaryLogs = [];
  }

  setSecondaryComposeLogs(logs: LogEntry[]): void {
    this.secondaryComposeLogs = logs;
  }

  clearSecondaryComposeLogs(): void {
    this.secondaryComposeLogs = [];
  }

  getStatsCollector(): StatsCollector {
    return this.statsCollector;
  }

  /**
   * Ids of containers that can report stats. Stopped containers return zeros,
   * so sampling them is wasted work.
   */
  getRunningContainerIds(): string[] {
    return this.store.getRunningContainerIds();
  }

  setInspectedEnv(containerId: string, env: string[]): void {
    this.inspectedEnv.set(containerId, env);
  }

  getInspectedEnv(containerId: string): string[] | undefined {
    return this.inspectedEnv.get(containerId);
  }

  setContainerChanges(containerId: string, changes: FilesystemChange[]): void {
    this.containerChanges.set(containerId, changes);
  }

  getContainerChanges(containerId: string): FilesystemChange[] | undefined {
    return this.containerChanges.get(containerId);
  }

  setImageLayers(imageId: string, layers: ImageLayer[]): void {
    this.imageLayers.set(imageId, layers);
  }

  getImageLayers(imageId: string): ImageLayer[] | undefined {
    return this.imageLayers.get(imageId);
  }

  static detailErrorKey(kind: 'env' | 'changes' | 'layers', id: string): string {
    return `${kind}:${id}`;
  }

  setDetailError(kind: 'env' | 'changes' | 'layers', id: string, message: string): void {
    this.detailErrors.set(DockerState.detailErrorKey(kind, id), message);
  }

  clearDetailError(kind: 'env' | 'changes' | 'layers', id: string): void {
    this.detailErrors.delete(DockerState.detailErrorKey(kind, id));
  }

  getMetrics(): DockerDashboardMetrics {
    const snap = this.store.getSnapshot();
    return {
      containers: snap.containers,
      images: snap.images,
      volumes: snap.volumes,
      networks: snap.networks,
      composeProjects: snap.composeProjects,
      statsCollector: this.statsCollector,
      inspectedEnv: this.inspectedEnv,
      containerChanges: this.containerChanges,
      imageLayers: this.imageLayers,
      detailErrors: this.detailErrors,
      selectedContainerLogs: this.selectedLogs,
      selectedComposeLogs: this.selectedComposeLogs,
      secondaryContainerLogs: this.secondaryLogs,
      secondaryComposeLogs: this.secondaryComposeLogs,
      lastRefresh: snap.lastRefresh,
      daemonConnected: snap.daemonConnected,
      resourceErrors: { ...snap.resourceErrors },
      logFilterString: '',
      logFilterMode: 'exact',
      logSeverityCounts: null,
      logSeverityTimeSeries: [],
      logTemplates: [],
      secondaryLogSeverityCounts: null,
      secondaryLogSeverityTimeSeries: [],
    };
  }
}
