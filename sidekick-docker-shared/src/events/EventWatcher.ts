import type { DockerClient } from '../docker/DockerClient';
import type { DockerEvent } from '../types/events';

export interface EventWatcherCallbacks {
  onEvent: (event: DockerEvent) => void;
  onError?: (error: Error) => void;
  onReconnect?: () => void;
}

/**
 * Wraps DockerClient.streamEvents() with auto-reconnection.
 * Emits typed callbacks for each Docker event.
 */
export class EventWatcher {
  private client: DockerClient;
  private callbacks: EventWatcherCallbacks;
  private running = false;
  private abortController: AbortController | null = null;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;

  constructor(client: DockerClient, callbacks: EventWatcherCallbacks) {
    this.client = client;
    this.callbacks = callbacks;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.reconnectDelay = 1000;
    this.watch();
  }

  stop(): void {
    this.running = false;
    this.abortController?.abort();
    this.abortController = null;
  }

  get isRunning(): boolean {
    return this.running;
  }

  private async watch(): Promise<void> {
    while (this.running) {
      try {
        this.abortController = new AbortController();
        for await (const event of this.client.streamEvents()) {
          if (!this.running) break;
          this.callbacks.onEvent(event);
        }
        // Stream ended normally — reconnect
        this.reconnectDelay = 1000;
      } catch (err) {
        if (!this.running) break;
        this.callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
      }

      if (!this.running) break;

      // Exponential backoff reconnect
      this.callbacks.onReconnect?.();
      await sleep(this.reconnectDelay);
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
