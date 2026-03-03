import {
  DockerClient,
  ComposeClient,
  ComposeDetector,
  ComposeFileReader,
  EventWatcher,
  StatsCollector,
} from 'sidekick-docker-shared';
import type {
  ContainerInfo,
  ImageInfo,
  VolumeInfo,
  NetworkInfo,
  ComposeProject,
  LogEntry,
  ContainerStats,
  ComposeFileConfig,
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
} from '../types/messages';

export interface DockerServiceCallbacks {
  onStateChange: (snapshot: DashboardStateSnapshot) => void;
  onLogsChange: (containerId: string, entries: SerializedLogEntry[]) => void;
  onStatsChange: (containerId: string, stats: SerializedContainerStats | null, loading: boolean, cpuHistory?: number[], memoryHistory?: number[]) => void;
  onComposeLogs: (projectName: string, serviceName: string | null, entries: SerializedLogEntry[]) => void;
  onEnvLoaded: (containerId: string, env: string[]) => void;
  onError: (message: string) => void;
}

export class DockerService {
  private client: DockerClient;
  private composeClient = new ComposeClient();
  private composeDetector = new ComposeDetector();
  private composeFileReader = new ComposeFileReader();
  private statsCollector = new StatsCollector();
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

  // Log streaming
  private logContainerId: string | null = null;
  private logAborted = false;
  private logs: LogEntry[] = [];

  // Stats streaming
  private statsContainerId: string | null = null;
  private statsAborted = false;
  private statsLoadingInterval: ReturnType<typeof setInterval> | null = null;

  // Compose log streaming
  private composeLogProject: string | null = null;
  private composeLogService: string | null = null;
  private composeLogAborted = false;
  private composeLogs: LogEntry[] = [];

  private refreshInterval: ReturnType<typeof setInterval> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private callbacks: DockerServiceCallbacks;
  private disposed = false;
  private cwd: string;

  constructor(callbacks: DockerServiceCallbacks, socketPath?: string) {
    this.client = new DockerClient(socketPath ? { socketPath } : undefined);
    this.callbacks = callbacks;
    this.cwd = process.cwd();
  }

  async initialize(): Promise<boolean> {
    const ok = await this.client.ping();
    if (!ok) return false;

    await this.refresh();

    this.watcher = new EventWatcher(this.client, {
      onEvent: (event) => {
        this.processEvent(event);
        this.scheduleStateUpdate();
      },
      onError: (err) => console.debug('event watcher error:', err),
    });
    this.watcher.start();

    this.refreshInterval = setInterval(() => {
      this.refresh().then(() => this.scheduleStateUpdate()).catch(e => console.debug('periodic refresh failed:', e));
    }, 30_000);

    return true;
  }

  private async refresh(): Promise<void> {
    try {
      const [containers, images, volumes, networks, fileConfig] = await Promise.all([
        this.client.listContainers(true),
        this.client.listImages(),
        this.client.listVolumes(),
        this.client.listNetworks(),
        this.composeFileReader.readFromDirectory(this.cwd).catch(() => null),
      ]);

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

  // ─── Selection-driven streaming ─────────────────────────────────

  async selectContainer(containerId: string | null): Promise<void> {
    // Stop current streams
    this.stopLogStream();
    this.stopStatsStream();

    if (!containerId) return;

    // Start log stream
    this.logContainerId = containerId;
    this.logAborted = false;
    this.logs = [];
    this.streamLogs(containerId);

    // Start stats stream
    this.statsContainerId = containerId;
    this.statsAborted = false;
    this.statsLoadingInterval = setInterval(() => {
      if (!this.disposed) {
        this.callbacks.onStatsChange(containerId, null, true);
      }
    }, 200);
    this.streamStats(containerId);

    // Fetch env vars
    if (!this.inspectedEnv.has(containerId)) {
      try {
        const info = await this.client.inspectContainer(containerId);
        const env = info.Config.Env || [];
        this.inspectedEnv.set(containerId, env);
        if (!this.disposed) {
          this.callbacks.onEnvLoaded(containerId, env);
        }
      } catch { /* ignore */ }
    } else {
      this.callbacks.onEnvLoaded(containerId, this.inspectedEnv.get(containerId)!);
    }
  }

  private async streamLogs(containerId: string): Promise<void> {
    try {
      for await (const entry of this.client.streamLogs(containerId, { follow: true, tail: 100 })) {
        if (this.logAborted || this.logContainerId !== containerId) break;
        this.logs.push(entry);
        if (this.logs.length > 1000) this.logs.shift();
        if (!this.disposed) {
          this.callbacks.onLogsChange(containerId, this.logs.map(serializeLogEntry));
        }
      }
    } catch { /* stream ended */ }
  }

  private async streamStats(containerId: string): Promise<void> {
    try {
      for await (const stats of this.client.streamStats(containerId)) {
        if (this.statsAborted || this.statsContainerId !== containerId) break;
        this.statsCollector.push(containerId, stats);
        this.clearStatsLoadingInterval();
        if (!this.disposed) {
          const cpuHistory = this.statsCollector.getCpuSeries(containerId);
          const memoryHistory = this.statsCollector.getMemorySeries(containerId);
          this.callbacks.onStatsChange(containerId, serializeStats(stats), false, cpuHistory, memoryHistory);
        }
      }
    } catch { /* stream ended */ }
  }

  private stopLogStream(): void {
    this.logAborted = true;
    this.logContainerId = null;
    this.logs = [];
  }

  private stopStatsStream(): void {
    this.statsAborted = true;
    this.statsContainerId = null;
    this.clearStatsLoadingInterval();
  }

  private clearStatsLoadingInterval(): void {
    if (this.statsLoadingInterval) {
      clearInterval(this.statsLoadingInterval);
      this.statsLoadingInterval = null;
    }
  }

  // ─── Compose log streaming ────────────────────────────────────────

  async selectComposeService(projectName: string, serviceName: string | null): Promise<void> {
    this.stopComposeLogStream();
    this.composeLogProject = projectName;
    this.composeLogService = serviceName;
    this.composeLogAborted = false;
    this.composeLogs = [];
    this.streamComposeLogs(projectName, serviceName);
  }

  private async streamComposeLogs(projectName: string, serviceName: string | null): Promise<void> {
    try {
      for await (const entry of this.composeClient.streamLogs(projectName, serviceName ?? undefined)) {
        if (this.composeLogAborted || this.composeLogProject !== projectName) break;
        this.composeLogs.push(entry);
        if (this.composeLogs.length > 1000) this.composeLogs.shift();
        if (!this.disposed) {
          this.callbacks.onComposeLogs(projectName, serviceName, this.composeLogs.map(serializeLogEntry));
        }
      }
    } catch { /* stream ended */ }
  }

  private stopComposeLogStream(): void {
    this.composeLogAborted = true;
    this.composeLogProject = null;
    this.composeLogService = null;
    this.composeLogs = [];
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

  async pruneImages(): Promise<void> {
    await this.client.pruneImages();
    await this.refresh();
    this.scheduleStateUpdate();
  }

  async removeVolume(name: string): Promise<void> {
    await this.client.removeVolume(name);
    await this.refresh();
    this.scheduleStateUpdate();
  }

  async pruneVolumes(): Promise<void> {
    await this.client.pruneVolumes();
    await this.refresh();
    this.scheduleStateUpdate();
  }

  async removeNetwork(id: string): Promise<void> {
    await this.client.removeNetwork(id);
    await this.refresh();
    this.scheduleStateUpdate();
  }

  async pruneNetworks(): Promise<void> {
    await this.client.pruneNetworks();
    await this.refresh();
    this.scheduleStateUpdate();
  }

  async composeUp(projectName: string): Promise<void> {
    await this.composeClient.up(projectName, this.cwd);
    await this.refresh();
    this.scheduleStateUpdate();
  }

  async composeDown(projectName: string): Promise<void> {
    await this.composeClient.down(projectName, this.cwd);
    await this.refresh();
    this.scheduleStateUpdate();
  }

  async composeRestart(projectName: string, serviceName?: string): Promise<void> {
    await this.composeClient.restart(projectName, serviceName, this.cwd);
    await this.refresh();
    this.scheduleStateUpdate();
  }

  async composeStop(projectName: string, serviceName?: string): Promise<void> {
    await this.composeClient.stop(projectName, serviceName, this.cwd);
    await this.refresh();
    this.scheduleStateUpdate();
  }

  getContainerName(containerId: string): string | undefined {
    return this.containers.find(c => c.id === containerId)?.name;
  }

  async forceRefresh(): Promise<void> {
    await this.refresh();
    this.scheduleStateUpdate();
  }

  dispose(): void {
    this.disposed = true;
    this.stopLogStream();
    this.stopStatsStream();
    this.stopComposeLogStream();
    if (this.refreshInterval) clearInterval(this.refreshInterval);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.watcher?.stop();
    this.client.dispose();
  }
}

// ─── Serialization helpers ───────────────────────────────────────────

function serializeContainer(c: ContainerInfo): SerializedContainerInfo {
  return { ...c, created: c.created.toISOString() };
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

function serializeStats(s: ContainerStats): SerializedContainerStats {
  return {
    cpuPercent: s.cpuPercent,
    memoryUsage: s.memoryUsage,
    memoryLimit: s.memoryLimit,
    memoryPercent: s.memoryPercent,
    networkRx: s.networkRx,
    networkTx: s.networkTx,
    pids: s.pids,
  };
}
