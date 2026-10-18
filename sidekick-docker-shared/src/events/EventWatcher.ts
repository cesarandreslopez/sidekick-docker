import type { DockerClient } from '../docker/DockerClient';
import type { DockerEvent } from '../types/events';
import { INITIAL_RECONNECT_DELAY, MAX_RECONNECT_DELAY } from './reconnect';

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
  private reconnectDelay = INITIAL_RECONNECT_DELAY;
  private loopToken = 0;

  constructor(client: DockerClient, callbacks: EventWatcherCallbacks) {
    this.client = client;
    this.callbacks = callbacks;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.reconnectDelay = INITIAL_RECONNECT_DELAY;
    // Each loop carries its own token: a start() right after stop() must not
    // leave the old loop (still awaiting its stream or sleep) running beside
    // the new one, sharing — and overwriting — the abort controller.
    void this.watch(++this.loopToken);
  }

  stop(): void {
    this.running = false;
    this.loopToken++;
    this.abortController?.abort();
    this.abortController = null;
  }

  get isRunning(): boolean {
    return this.running;
  }

  private async watch(token: number): Promise<void> {
    const live = () => this.running && token === this.loopToken;
    while (live()) {
      const controller = new AbortController();
      this.abortController = controller;
      try {
        for await (const event of this.client.streamEvents(undefined, controller.signal)) {
          if (!live()) break;
          // A delivered event proves the connection is good again.
          this.reconnectDelay = INITIAL_RECONNECT_DELAY;
          this.callbacks.onEvent(event);
        }
        // Stream ended normally — reconnect
        this.reconnectDelay = INITIAL_RECONNECT_DELAY;
      } catch (err) {
        if (!live()) break;
        this.callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
      }

      if (!live()) break;

      // Exponential backoff reconnect (cancellable via abort)
      this.callbacks.onReconnect?.();
      await this.cancellableSleep(this.reconnectDelay, controller.signal);
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY);
    }
  }

  /** Sleep that resolves early when this loop's controller is aborted by stop(). */
  private cancellableSleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise(resolve => {
      if (signal.aborted) { resolve(); return; }
      const onAbort = () => { clearTimeout(timer); resolve(); };
      const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(); }, ms);
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }
}
