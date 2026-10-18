import { FollowStream, LogResumeCursor, MAX_LOG_LINES } from 'sidekick-docker-shared';
import type { LogEntry } from 'sidekick-docker-shared';
import type { StreamStateUpdate } from '../types/messages';

export interface LogSlotSpec<K> {
  kind: 'logs' | 'composeLogs';
  same(a: K, b: K): boolean;
  /** The id the webview files this stream's state under. */
  itemId(key: K): string;
  /** Open the source. On a reconnect, `since` is the cursor position (when known). */
  open(key: K, signal: AbortSignal, resume: { reconnect: boolean; cursor: LogResumeCursor }): AsyncIterable<LogEntry>;
  isRunning(key: K): boolean | undefined;
  /** Deliver the buffer (throttled to 100ms, and once more when an attempt ends). */
  publish(key: K, entries: LogEntry[]): void;
  onEntry?(key: K, entry: LogEntry): void;
  onState(update: StreamStateUpdate): void;
}

/**
 * One selection-driven log stream (primary or compare, container or compose)
 * with its ring buffer. Reconnect policy is the shared FollowStream's: a
 * stopped target's stream ends, reconnects resume from the last timestamp, and
 * replays are dropped — so a restart never appends the tail twice.
 */
export class LogSlot<K> {
  private key: K | null = null;
  private stream: FollowStream<LogEntry> | null = null;
  private entries: LogEntry[] = [];
  private cursor = new LogResumeCursor();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly spec: LogSlotSpec<K>) {}

  get current(): K | null {
    return this.key;
  }

  /** Stream `key` (or nothing). A no-op when it is already the current key. */
  ensure(key: K | null): void {
    if (key === null ? this.key === null : this.key !== null && this.spec.same(key, this.key)) return;
    this.stop();
    if (key === null) return;

    this.key = key;
    const itemId = this.spec.itemId(key);
    const stream = new FollowStream<LogEntry>({
      open: (signal, { reconnect }) => {
        if (reconnect) this.cursor.beginResume();
        return this.spec.open(key, signal, { reconnect, cursor: this.cursor });
      },
      accept: entry => !this.cursor.isReplay(entry),
      onItem: (entry) => {
        this.cursor.observe(entry);
        this.entries.push(entry);
        if (this.entries.length > MAX_LOG_LINES) this.entries.shift();
        this.spec.onEntry?.(key, entry);
        this.scheduleFlush();
      },
      onAttemptEnd: () => this.flush(),
      isTargetRunning: () => this.spec.isRunning(key),
      onState: (state, message) => this.spec.onState({ kind: this.spec.kind, itemId, state, message }),
    });
    this.stream = stream;
    stream.start();
  }

  /** The target may have started again: reconnect a finished stream. */
  resume(): void {
    this.stream?.resume();
  }

  stop(): void {
    if (this.key !== null) this.flush();
    this.stream?.stop();
    this.stream = null;
    this.key = null;
    this.entries = [];
    this.cursor.reset();
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, 100);
  }

  private flush(): void {
    if (this.key !== null) this.spec.publish(this.key, this.entries);
  }
}
