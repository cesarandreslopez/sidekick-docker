import { DockerClient, DockerStateStore, EventWatcher, explainDockerUnreachable, describeDockerEndpoint, errorMessage } from 'sidekick-docker-shared';
import type { ContainerInfo, DockerClientOptions, StoreChange } from 'sidekick-docker-shared';
import { POINT_ELSEWHERE } from './endpointHint';

export interface ContainerWatcherCallbacks {
  /** Fired with the containers AND the real connection state they were observed under. */
  onContainersChanged: (containers: ContainerInfo[], connected: boolean) => void;
  /** `reason` explains a disconnect (permission denied, no socket, refused…). */
  onConnectionChanged: (connected: boolean, reason?: string) => void;
}

export interface ContainerWatcherOptions {
  clientOptions?: DockerClientOptions;
  refreshIntervalMs?: number;
  /** The raw endpoint setting, to describe it in errors. */
  endpoint?: string;
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
  private endpoint: string | undefined;
  private reason: string | undefined;

  constructor(callbacks: ContainerWatcherCallbacks, options?: ContainerWatcherOptions) {
    this.client = new DockerClient(options?.clientOptions);
    this.callbacks = callbacks;
    this.refreshIntervalMs = options?.refreshIntervalMs ?? 30_000;
    this.endpoint = options?.endpoint;
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
      const ping = await this.client.pingDetailed();
      if (this.disposed) return false;
      if (!ping.ok) {
        this.setConnected(false, this.explain(ping.error));
        return false;
      }

      this.setConnected(true);
      await this.refresh();
      if (this.disposed || !this.connected) return false;
      this.stopWatcher();

      // Start event watcher
      this.watcher = new EventWatcher(this.client, {
        onEvent: (event) => { this.store.processEvent(event); },
        onError: (err) => {
          // A dropped event stream is not a dead daemon (an idle proxy or a
          // daemon restart drops it too). Reconnect at once; only a failed
          // ping reports Docker offline, with the ping's explained reason.
          console.debug('watcher event stream lost:', errorMessage(err));
          this.stopWatcher();
          void this.tryConnect().then((ok) => { if (!ok) this.startReconnectPolling(); });
        },
      });
      this.watcher.start();

      this.startRefreshTimer();

      this.stopReconnectPolling();
      return true;
    } catch (err) {
      if (this.disposed) return false;
      this.setConnected(false, this.explain(err));
      return false;
    }
  }

  /** "Docker socket not found at …", "Permission denied on …" — not a raw ENOENT. */
  private explain(err: unknown): string {
    return explainDockerUnreachable(err, describeDockerEndpoint(this.endpoint), POINT_ELSEWHERE);
  }

  private refresh(): Promise<void> {
    return this.store.refresh();
  }

  /** Fallback full refresh (events update the tree in between). */
  private startRefreshTimer(): void {
    this.refreshInterval = setInterval(() => {
      this.refresh().catch(e => console.debug('watcher refresh failed:', e));
    }, this.refreshIntervalMs);
  }

  /** Change the fallback refresh interval without reconnecting (no "Connecting…" flash). */
  setRefreshInterval(ms: number): void {
    if (ms === this.refreshIntervalMs) return;
    this.refreshIntervalMs = ms;
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.startRefreshTimer();
    }
  }

  private onStoreChange(change: StoreChange): void {
    if (this.disposed) return;
    if (change.cause === 'refresh') {
      const snapshot = this.store.getSnapshot();
      if (!snapshot.daemonConnected) {
        this.stopWatcher();
        if (this.connectPromise) {
          // Inside connect(): the ping just succeeded, so the listing's own
          // error is the best reason there is.
          this.setConnected(false, snapshot.resourceErrors.containers);
        } else {
          // The daemon went away mid-session. The listing only has a raw
          // message ("connect ENOENT …"); ping again for the explained reason
          // (no socket, permission, refused) that replaces the tree's message.
          // Until that ping answers, say so rather than leave the tree blank.
          this.setConnected(false, this.reason ?? 'Docker stopped responding; checking…');
          void this.tryConnect();
        }
        this.callbacks.onContainersChanged([], false);
        this.startReconnectPolling();
        return;
      }
      this.setConnected(true);
    }
    this.callbacks.onContainersChanged(this.getContainers(), this.connected);
  }

  private setConnected(value: boolean, reason?: string): void {
    if (this.disposed) return;
    const reasonChanged = !value && reason !== this.reason;
    this.reason = value ? undefined : reason;
    // Notify on every change, plus once for the initial state: `connected`
    // starts out false, so a failed first connect would otherwise never
    // reach the callbacks and the daemon-down UI would stay unreachable.
    const changed = this.connected !== value;
    this.connected = value;
    if (changed || reasonChanged || !this.connectionNotified) {
      this.connectionNotified = true;
      this.callbacks.onConnectionChanged(value, this.reason);
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

  /** Why the last connection attempt failed, while disconnected. */
  getDisconnectReason(): string | undefined {
    return this.reason;
  }

  /**
   * Refresh now ("Retry Connection" and the refresh button). While
   * disconnected this is a reconnect, whose ping explains the failure — a bare
   * refresh replaced the explanation with the listing's raw error.
   */
  async forceRefresh(): Promise<void> {
    if (!this.connected) {
      await this.tryConnect();
      return;
    }
    await this.refresh();
    // A failed refresh starts a reconnect; let the caller see how it ends.
    await this.connectPromise;
  }

  dispose(): void {
    this.disposed = true;
    this.stopWatcher();
    this.stopReconnectPolling();
    this.store.dispose();
    this.client.dispose();
  }
}
