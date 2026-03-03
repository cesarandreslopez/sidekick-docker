import type {
  ContainerInfo,
  ImageInfo,
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
  selectedContainerLogs: LogEntry[];
  selectedComposeLogs: LogEntry[];
  lastRefresh: Date | null;
  daemonConnected: boolean;
  logFilterString: string;
  logFilterMode: FilterMode;
  logSeverityCounts: SeverityCounts | null;
  logSeverityTimeSeries: { severity: SeverityLevel; total: number }[];
  logTemplates: LogTemplate[];
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
  private inspectedEnv = new Map<string, string[]>();
  private lastRefresh: Date | null = null;
  private daemonConnected = false;
  private cachedFileConfig: ComposeFileConfig | null = null;

  constructor(client: DockerClient, cwd?: string) {
    this.client = client;
    this.cwd = cwd;
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
        // For non-container resources, trigger a full refresh
        // These events are less frequent, so the overhead is acceptable
        this.refresh().catch(e => console.debug('refresh failed:', e));
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
        // Trigger full refresh for accurate data
        this.refresh().catch(e => console.debug('refresh failed:', e));
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
        break;
      case 'create':
        // New container — refresh to get full info
        this.refresh().catch(e => console.debug('refresh failed:', e));
        break;
      default:
        // rename, update, etc. — refresh
        if (name) {
          this.refresh().catch(e => console.debug('refresh failed:', e));
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

  getStatsCollector(): StatsCollector {
    return this.statsCollector;
  }

  setInspectedEnv(containerId: string, env: string[]): void {
    this.inspectedEnv.set(containerId, env);
  }

  getInspectedEnv(containerId: string): string[] | undefined {
    return this.inspectedEnv.get(containerId);
  }

  getMetrics(): DockerDashboardMetrics {
    return {
      containers: [...this.containers],
      images: [...this.images],
      volumes: [...this.volumes],
      networks: [...this.networks],
      composeProjects: [...this.composeProjects],
      statsCollector: this.statsCollector,
      inspectedEnv: this.inspectedEnv,
      selectedContainerLogs: [...this.selectedLogs],
      selectedComposeLogs: [...this.selectedComposeLogs],
      lastRefresh: this.lastRefresh,
      daemonConnected: this.daemonConnected,
      logFilterString: '',
      logFilterMode: 'exact',
      logSeverityCounts: null,
      logSeverityTimeSeries: [],
      logTemplates: [],
    };
  }
}
