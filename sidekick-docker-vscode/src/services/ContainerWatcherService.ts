import { DockerClient, DockerStateStore, EventWatcher } from 'sidekick-docker-shared';
import type { ContainerInfo, DockerClientOptions, StoreChange } from 'sidekick-docker-shared';

export interface ContainerWatcherCallbacks {
  /** Fired with the containers AND the real connection state they were observed under. */
  onContainersChanged: (containers: ContainerInfo[], connected: boolean) => void;
  onConnectionChanged: (connected: boolean) => void;
}

export interface ContainerWatcherOptions {
  clientOptions?: DockerClientOptions;
  refreshIntervalMs?: number;
}

/**
 * Lightweight always-on Docker watcher that only tracks containers + events.
 * Separate from DockerService (which is webview-lifecycle-bound).
 * Used by: tree view, badge, status bar, quick pick commands.
 */
export class ContainerWatcherService {
  private client: DockerClient;
  /** Containers-only store: same refresh/event policy as the dashboards, one listing per pass. */
  private store: DockerStateStore;
  private watcher: EventWatcher | null = null;
  private connected = false;
  private connectionNotified = false;
  private disposed = false;
  private connectPromise: Promise<boolean> | null = null;

  private refreshInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectInterval: ReturnType<typeof setInterval> | null = null;
  private callbacks: ContainerWatcherCallbacks;
  private refreshIntervalMs: number;

  constructor(callbacks: ContainerWatcherCallbacks, options?: ContainerWatcherOptions) {
    this.client = new DockerClient(options?.clientOptions);
    this.callbacks = callbacks;
    this.refreshIntervalMs = options?.refreshIntervalMs ?? 30_000;
    this.store = new DockerStateStore({
      client: this.client,
      include: { images: false, volumes: false, networks: false, compose: false },
      onChange: change => this.onStoreChange(change),
      log: (msg, err) => console.debug('watcher', msg, err ?? ''),
    });
  }

  async start(): Promise<void> {
    await this.tryConnect();
    if (!this.connected) {
      this.startReconnectPolling();
    }
  }

  private tryConnect(): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false);
    if (this.connectPromise) return this.connectPromise;
    this.connectPromise = this.connect().finally(() => { this.connectPromise = null; });
    return this.connectPromise;
  }

  private async connect(): Promise<boolean> {
    try {
      const ok = await this.client.ping();
      if (this.disposed) return false;
      if (!ok) {
        this.setConnected(false);
        return false;
      }

      this.setConnected(true);
      await this.refresh();
      if (this.disposed || !this.connected) return false;
      this.stopWatcher();

      // Start event watcher
      this.watcher = new EventWatcher(this.client, {
        onEvent: (event) => { this.store.processEvent(event); },
        onError: () => {
          this.setConnected(false);
          this.stopWatcher();
          this.startReconnectPolling();
        },
      });
      this.watcher.start();

      // Fallback refresh
      this.refreshInterval = setInterval(() => {
        this.refresh().catch(e => console.debug('watcher refresh failed:', e));
      }, this.refreshIntervalMs);

      this.stopReconnectPolling();
      return true;
    } catch {
      if (this.disposed) return false;
      this.setConnected(false);
      return false;
    }
  }

  private refresh(): Promise<void> {
    return this.store.refresh();
  }

  private onStoreChange(change: StoreChange): void {
    if (this.disposed) return;
    if (change.cause === 'refresh') {
      if (!this.store.getSnapshot().daemonConnected) {
        this.setConnected(false);
        this.callbacks.onContainersChanged([], false);
        this.stopWatcher();
        this.startReconnectPolling();
        return;
      }
      this.setConnected(true);
    }
    this.callbacks.onContainersChanged(this.getContainers(), this.connected);
  }

  private setConnected(value: boolean): void {
    if (this.disposed) return;
    // Notify on every change, plus once for the initial state: `connected`
    // starts out false, so a failed first connect would otherwise never
    // reach the callbacks and the daemon-down UI would stay unreachable.
    const changed = this.connected !== value;
    this.connected = value;
    if (changed || !this.connectionNotified) {
      this.connectionNotified = true;
      this.callbacks.onConnectionChanged(value);
    }
  }

  private startReconnectPolling(): void {
    if (this.reconnectInterval || this.disposed) return;
    this.reconnectInterval = setInterval(async () => {
      const ok = await this.tryConnect();
      if (ok) this.stopReconnectPolling();
    }, 10_000);
  }

  private stopReconnectPolling(): void {
    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval);
      this.reconnectInterval = null;
    }
  }

  private stopWatcher(): void {
    this.watcher?.stop();
    this.watcher = null;
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  getContainers(): ContainerInfo[] {
    return this.connected ? this.store.getSnapshot().containers : [];
  }

  isConnected(): boolean {
    return this.connected;
  }

  async forceRefresh(): Promise<void> {
    await this.refresh();
  }

  dispose(): void {
    this.disposed = true;
    this.stopWatcher();
    this.stopReconnectPolling();
    this.store.dispose();
    this.client.dispose();
  }
}
