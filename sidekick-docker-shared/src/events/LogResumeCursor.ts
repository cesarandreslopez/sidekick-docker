import type { LogEntry } from '../types/container';

/**
 * Remembers how far a log stream got, so a reconnect can ask for "everything
 * since then" instead of re-requesting the tail and appending it twice.
 *
 * Timestamps are millisecond-precise here while the daemon's are nanosecond,
 * so asking for `since = last` replays the entries that share the last
 * millisecond; those are recognised by message and dropped via
 * {@link isReplay}. Entries without a timestamp are never treated as replays.
 */
export class LogResumeCursor {
  private lastMs: number | null = null;
  private atLast = new Set<string>();

  observe(entry: LogEntry): void {
    if (!entry.timestamp) return;
    const t = entry.timestamp.getTime();
    if (Number.isNaN(t)) return;
    if (this.lastMs === null || t > this.lastMs) {
      this.lastMs = t;
      this.atLast = new Set([entry.message]);
    } else if (t === this.lastMs) {
      this.atLast.add(entry.message);
    }
  }

  isReplay(entry: LogEntry): boolean {
    if (this.lastMs === null || !entry.timestamp) return false;
    const t = entry.timestamp.getTime();
    if (t < this.lastMs) return true;
    return t === this.lastMs && this.atLast.has(entry.message);
  }

  /** Fractional UNIX seconds, the form the Docker API's `since` accepts. */
  sinceSeconds(): number | undefined {
    return this.lastMs === null ? undefined : this.lastMs / 1000;
  }

  /** RFC 3339, for `docker compose logs --since`. */
  sinceIso(): string | undefined {
    return this.lastMs === null ? undefined : new Date(this.lastMs).toISOString();
  }

  reset(): void {
    this.lastMs = null;
    this.atLast = new Set();
  }
}
