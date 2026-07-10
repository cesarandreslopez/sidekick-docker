import { DockerClient, EventWatcher } from 'sidekick-docker-shared';
import type { ContainerInfo, DockerClientOptions } from 'sidekick-docker-shared';

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
  private watcher: EventWatcher | null = null;
  private containers: ContainerInfo[] = [];
  private connected = false;
  private connectionNotified = false;
  private disposed = false;

  private refreshInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectInterval: ReturnType<typeof setInterval> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private callbacks: ContainerWatcherCallbacks;
  private refreshIntervalMs: number;

  constructor(callbacks: ContainerWatcherCallbacks, options?: ContainerWatcherOptions) {
    this.client = new DockerClient(options?.clientOptions);
    this.callbacks = callbacks;
    this.refreshIntervalMs = options?.refreshIntervalMs ?? 30_000;
  }

  async start(): Promise<void> {
    await this.tryConnect();
    if (!this.connected) {
      this.startReconnectPolling();
    }
  }

  private async tryConnect(): Promise<boolean> {
    try {
      const ok = await this.client.ping();
      if (!ok) {
        this.setConnected(false);
        return false;
      }

      this.setConnected(true);
      await this.refresh();

      // Start event watcher
      this.watcher = new EventWatcher(this.client, {
        onEvent: (event) => {
          if (event.resourceType === 'container') {
            this.handleContainerEvent(event);
          }
          this.scheduleRefresh();
        },
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
      this.setConnected(false);
      return false;
    }
  }

  private async refresh(): Promise<void> {
    if (this.disposed) return;
    try {
      this.containers = await this.client.listContainers(true);
      this.setConnected(true);
      this.callbacks.onContainersChanged(this.containers, true);
    } catch {
      this.setConnected(false);
      this.containers = [];
      this.callbacks.onContainersChanged(this.containers, false);
      this.stopWatcher();
      this.startReconnectPolling();
    }
  }

  private handleContainerEvent(event: { type: string; resourceId: string }): void {
    switch (event.type) {
      case 'start':
      case 'unpause': {
        const c = this.containers.find(c => c.id === event.resourceId);
        if (c) {
          c.state = 'running';
          c.status = 'Up just now';
        }
        break;
      }
      case 'stop':
      case 'die': {
        const c = this.containers.find(c => c.id === event.resourceId);
        if (c) {
          c.state = 'exited';
          c.status = 'Exited';
        }
        break;
      }
      case 'pause': {
        const c = this.containers.find(c => c.id === event.resourceId);
        if (c) c.state = 'paused';
        break;
      }
      case 'destroy':
        this.containers = this.containers.filter(c => c.id !== event.resourceId);
        break;
    }
    this.callbacks.onContainersChanged(this.containers, this.connected);
  }

  private scheduleRefresh(): void {
    if (this.debounceTimer || this.disposed) return;
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.refresh().catch(e => console.debug('debounced refresh failed:', e));
    }, 100);
  }

  private setConnected(value: boolean): void {
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
    return this.containers;
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
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.client.dispose();
  }
}
