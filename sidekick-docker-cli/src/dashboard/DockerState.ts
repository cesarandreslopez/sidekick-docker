import type {
  ContainerInfo,
  ImageInfo,
  ImageLayer,
  FilesystemChange,
  VolumeInfo,
  NetworkInfo,
  ComposeProject,
  DockerEvent,
  ComposeFileConfig,
} from 'sidekick-docker-shared';
import { DockerClient, ComposeDetector, StatsCollector, ComposeFileReader, MAX_LOG_LINES } from 'sidekick-docker-shared';
import type { LogEntry, FilterMode, SeverityCounts, SeverityLevel, LogTemplate } from 'sidekick-docker-shared';

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
  selectedContainerLogs: LogEntry[];
  selectedComposeLogs: LogEntry[];
  secondaryContainerLogs: LogEntry[];
  secondaryComposeLogs: LogEntry[];
  lastRefresh: Date | null;
  daemonConnected: boolean;
  logFilterString: string;
  logFilterMode: FilterMode;
  logSeverityCounts: SeverityCounts | null;
  logSeverityTimeSeries: { severity: SeverityLevel; total: number }[];
  logTemplates: LogTemplate[];
  secondaryLogSeverityCounts: SeverityCounts | null;
  secondaryLogSeverityTimeSeries: { severity: SeverityLevel; total: number }[];
}

export class DockerState {
  private client: DockerClient;
  private composeDetector = new ComposeDetector();
  private composeFileReader = new ComposeFileReader();
  private statsCollector = new StatsCollector();

  private cwd: string | undefined;
  private containers: ContainerInfo[] = [];
  private images: ImageInfo[] = [];
  private volumes: VolumeInfo[] = [];
  private networks: NetworkInfo[] = [];
  private composeProjects: ComposeProject[] = [];
  private selectedLogs: LogEntry[] = [];
  private selectedComposeLogs: LogEntry[] = [];
  private secondaryLogs: LogEntry[] = [];
  private secondaryComposeLogs: LogEntry[] = [];
  private inspectedEnv = new Map<string, string[]>();
  private containerChanges = new Map<string, FilesystemChange[]>();
  private imageLayers = new Map<string, ImageLayer[]>();
  private lastRefresh: Date | null = null;
  private daemonConnected = false;
  private cachedFileConfig: ComposeFileConfig | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(client: DockerClient, cwd?: string) {
    this.client = client;
    this.cwd = cwd;
  }

  /** Debounced refresh — coalesces rapid event-driven refreshes into a single call. */
  private scheduleRefresh(): void {
    if (this.refreshTimer) return;
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      this.refresh().catch(e => console.debug('refresh failed:', e));
    }, 500);
  }

  dispose(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  async refresh(): Promise<void> {
    try {
      const promises: [
        Promise<ContainerInfo[]>,
        Promise<ImageInfo[]>,
        Promise<VolumeInfo[]>,
        Promise<NetworkInfo[]>,
        Promise<ComposeFileConfig | null>,
      ] = [
        this.client.listContainers(true),
        this.client.listImages(),
        this.client.listVolumes(),
        this.client.listNetworks(),
        this.cwd ? this.composeFileReader.readFromDirectory(this.cwd) : Promise.resolve(null),
      ];

      const [containers, images, volumes, networks, fileConfig] = await Promise.all(promises);

      this.containers = containers;
      this.images = images;
      this.volumes = volumes;
      this.networks = networks;
      this.cachedFileConfig = fileConfig;
      this.composeProjects = this.composeDetector.detect(containers, fileConfig);
      this.lastRefresh = new Date();
      this.daemonConnected = true;

      // Prune stale cache entries for removed containers/images
      const currentContainerIds = new Set(containers.map(c => c.id));
      for (const id of this.inspectedEnv.keys()) {
        if (!currentContainerIds.has(id)) this.inspectedEnv.delete(id);
      }
      for (const id of this.containerChanges.keys()) {
        if (!currentContainerIds.has(id)) this.containerChanges.delete(id);
      }
      const currentImageIds = new Set(images.map(i => i.id));
      for (const id of this.imageLayers.keys()) {
        if (!currentImageIds.has(id)) this.imageLayers.delete(id);
      }
      const runningIds = new Set(containers.filter(c => c.state === 'running').map(c => c.id));
      this.statsCollector.prune(runningIds);
    } catch {
      this.daemonConnected = false;
    }
  }

  processEvent(event: DockerEvent): void {
    // Incremental updates based on Docker event type
    switch (event.resourceType) {
      case 'container':
        this.handleContainerEvent(event);
        break;
      case 'image':
      case 'volume':
      case 'network':
        // For non-container resources, trigger a debounced refresh
        this.scheduleRefresh();
        break;
    }
  }

  private handleContainerEvent(event: DockerEvent): void {
    const { type, resourceId } = event;
    const name = event.attributes['name'] || '';

    switch (type) {
      case 'start':
      case 'unpause': {
        const existing = this.containers.find(c => c.id === resourceId);
        if (existing) {
          existing.state = 'running';
          existing.status = 'Up just now';
        }
        // Debounced refresh for accurate data
        this.scheduleRefresh();
        break;
      }
      case 'stop':
      case 'die': {
        const existing = this.containers.find(c => c.id === resourceId);
        if (existing) {
          existing.state = 'exited';
          existing.status = 'Exited';
        }
        break;
      }
      case 'pause': {
        const existing = this.containers.find(c => c.id === resourceId);
        if (existing) {
          existing.state = 'paused';
        }
        break;
      }
      case 'destroy':
        this.containers = this.containers.filter(c => c.id !== resourceId);
        this.statsCollector.remove(resourceId);
        this.inspectedEnv.delete(resourceId);
        this.containerChanges.delete(resourceId);
        break;
      case 'create':
        // New container — debounced refresh to get full info
        this.scheduleRefresh();
        break;
      default:
        // rename, update, health_status, etc. — debounced refresh
        if (name) {
          this.scheduleRefresh();
        }
        break;
    }

    // Update compose projects (use cached file config)
    this.composeProjects = this.composeDetector.detect(this.containers, this.cachedFileConfig);
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
    return this.containers.filter(c => c.state === 'running').map(c => c.id);
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

  getMetrics(): DockerDashboardMetrics {
    return {
      containers: this.containers,
      images: this.images,
      volumes: this.volumes,
      networks: this.networks,
      composeProjects: this.composeProjects,
      statsCollector: this.statsCollector,
      inspectedEnv: this.inspectedEnv,
      containerChanges: this.containerChanges,
      imageLayers: this.imageLayers,
      selectedContainerLogs: this.selectedLogs,
      selectedComposeLogs: this.selectedComposeLogs,
      secondaryContainerLogs: this.secondaryLogs,
      secondaryComposeLogs: this.secondaryComposeLogs,
      lastRefresh: this.lastRefresh,
      daemonConnected: this.daemonConnected,
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
