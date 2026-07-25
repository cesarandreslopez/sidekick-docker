import type { ContainerStats } from '../types/container';

/** How often to take a full sweep while list-wide stats are needed. */
export const STATS_SAMPLE_INTERVAL_MS = 3000;

/** Concurrent in-flight samples. Keeps a 100-container host from fanning out at once. */
const MAX_CONCURRENT = 8;

export interface StatsSamplerOptions {
  /** Take a single reading. Wire to `DockerClient.sampleStats`. */
  sample: (id: string) => Promise<ContainerStats>;
  /** Record a reading. Wire to `StatsCollector.push`. */
  push: (id: string, stats: ContainerStats) => void;
  /** Called once per sweep that recorded at least one reading. */
  onChange: () => void;
  /** Override the sweep interval (tests). */
  intervalMs?: number;
}

/**
 * Polls one-shot stats for *every* container the list cares about.
 *
 * Both frontends stream stats for a single container at a time, because a live
 * stream each is expensive. That leaves list-wide features — sorting by
 * cpu/mem/net/io/pids, and a CPU/MEM column — reading the collector for rows
 * that never had a sample, i.e. comparing zeros. This fills that gap with
 * cheap periodic snapshots.
 *
 * Dependencies are injected rather than imported so this can live in the
 * `stats` module, which the import DAG restricts to `types`. It also keeps the
 * class testable without a Docker daemon.
 *
 * Only runs while something needs it; `setIds([])` stops the timer.
 */
export class StatsSampler {
  private readonly opts: StatsSamplerOptions;
  private readonly intervalMs: number;

  private ids: string[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Guards against a slow sweep overlapping the next tick. */
  private sweeping = false;
  private disposed = false;

  constructor(opts: StatsSamplerOptions) {
    this.opts = opts;
    this.intervalMs = opts.intervalMs ?? STATS_SAMPLE_INTERVAL_MS;
  }

  /**
   * Set the containers to sample; an empty list stops sampling. Sweeps
   * immediately when the set changes so sorting has data without waiting a
   * full interval.
   */
  setIds(ids: string[]): void {
    if (this.disposed) return;

    const changed = ids.length !== this.ids.length || ids.some((id, i) => id !== this.ids[i]);
    this.ids = [...ids];

    if (ids.length === 0) {
      this.stopTimer();
      return;
    }

    if (this.timer === null) {
      void this.sweep();
      this.scheduleNext();
    } else if (changed) {
      void this.sweep();
    }
  }

  private scheduleNext(): void {
    if (this.disposed || this.ids.length === 0) return;
    // Capture the handle so the completion callback can prove it still owns the
    // schedule. A sweep can outlive its own tick, and `setIds` re-arms whenever
    // it finds `timer === null`; without this check the stale chain would null
    // out the newer chain's handle and then schedule a second one, leaving two
    // timers running and only the last reachable from `stopTimer`.
    const handle: ReturnType<typeof setTimeout> = setTimeout(() => {
      void this.sweep().finally(() => {
        if (this.timer !== handle) return;
        this.timer = null;
        this.scheduleNext();
      });
    }, this.intervalMs);
    this.timer = handle;
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /** Exposed for tests; callers drive this through `setIds`. */
  async sweep(): Promise<void> {
    if (this.sweeping || this.disposed) return;
    this.sweeping = true;
    try {
      const queue = [...this.ids];
      let pushed = false;

      const worker = async (): Promise<void> => {
        for (;;) {
          const id = queue.shift();
          if (id === undefined || this.disposed) return;
          try {
            const stats = await this.opts.sample(id);
            // Re-check: dispose can land while this sample was in flight, and
            // pushing into a torn-down collector would resurrect dead state.
            if (this.disposed) return;
            this.opts.push(id, stats);
            pushed = true;
          } catch {
            // A container can stop between listing and sampling. Skipping it
            // leaves the previous sample in place rather than zeroing the row.
          }
        }
      };

      await Promise.all(
        Array.from({ length: Math.min(MAX_CONCURRENT, queue.length) }, () => worker()),
      );

      if (pushed && !this.disposed) this.opts.onChange();
    } finally {
      this.sweeping = false;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.stopTimer();
    this.ids = [];
  }
}
