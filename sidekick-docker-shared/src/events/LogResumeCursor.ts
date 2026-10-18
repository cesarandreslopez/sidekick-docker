import type { LogEntry } from '../types/container';

/**
 * Remembers how far a log stream got, so a reconnect can ask for "everything
 * since then" instead of re-requesting the tail and appending it twice.
 *
 * Replay filtering is armed only for a reconnect ({@link beginResume}): a
 * first connect's backlog is never filtered. That matters for Compose, whose
 * `logs --follow` interleaves each container's backlog out of time order —
 * a global "older than the newest line" rule dropped other services' lines.
 *
 * Timestamps here are millisecond-precise while the daemon's are nanosecond,
 * so `since = last` replays the entries that share the last millisecond.
 * Those are recognised by message, counted, so a line legitimately repeated
 * within the same millisecond is dropped only as many times as it was seen.
 * Entries without a timestamp are never treated as replays.
 */
export class LogResumeCursor {
  private lastMs: number | null = null;
  private atLast = new Map<string, number>();
  private resume: { lastMs: number; pending: Map<string, number> } | null = null;

  observe(entry: LogEntry): void {
    if (!entry.timestamp) return;
    const t = entry.timestamp.getTime();
    if (Number.isNaN(t)) return;
    if (this.lastMs === null || t > this.lastMs) {
      this.lastMs = t;
      this.atLast = new Map([[entry.message, 1]]);
    } else if (t === this.lastMs) {
      this.atLast.set(entry.message, (this.atLast.get(entry.message) ?? 0) + 1);
    }
  }

  /** Arm replay filtering for the reconnect about to start (requested with {@link sinceSeconds}). */
  beginResume(): void {
    this.resume = this.lastMs === null ? null : { lastMs: this.lastMs, pending: new Map(this.atLast) };
  }

  isReplay(entry: LogEntry): boolean {
    const r = this.resume;
    if (!r || !entry.timestamp) return false;
    const t = entry.timestamp.getTime();
    if (t < r.lastMs) return true;
    if (t > r.lastMs) return false;
    const left = r.pending.get(entry.message) ?? 0;
    if (left <= 0) return false;
    r.pending.set(entry.message, left - 1);
    return true;
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
    this.atLast = new Map();
    this.resume = null;
  }
}
