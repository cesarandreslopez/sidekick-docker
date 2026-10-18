import { ReconnectScheduler } from './reconnect';

/**
 * Lifecycle of one followed stream, as both dashboards display it.
 * `ended`/`empty`: the source finished and its target is stopped — nothing to
 * reconnect to. `error`: reconnecting gave up.
 */
export type FollowStreamState = 'loading' | 'live' | 'reconnecting' | 'ended' | 'empty' | 'error';

export interface FollowStreamOptions<T> {
  /** Open the source. `reconnect` is true for every attempt after the first. */
  open(signal: AbortSignal, attempt: { reconnect: boolean }): AsyncIterable<T>;
  /** Called for each item that passes `accept`. */
  onItem(item: T): void;
  /**
   * Filter for replayed items (e.g. a log tail re-sent on reconnect). Rejected
   * items are dropped and do not count as progress for backoff purposes.
   */
  accept?(item: T): boolean;
  /**
   * Whether the stream's target is running right now, consulted when the
   * source ends. `false` means "stopped": a follow stream of a stopped
   * container ends right after its backlog, so reconnecting would only replay
   * it. `undefined` means unknown and is treated like running.
   */
  isTargetRunning?(): boolean | undefined;
  onState?(state: FollowStreamState, message?: string): void;
  /** Called once an attempt finishes (normally or not), e.g. to flush buffers. */
  onAttemptEnd?(): void;
  /** Called with errors from the source, for debug logging. */
  onError?(error: unknown): void;
  scheduler?: ReconnectScheduler;
}

const GAVE_UP = 'Stream could not reconnect. Retry to connect again.';

/**
 * One followed stream (logs, stats) with a single reconnect policy for both
 * dashboards:
 *
 * 1. The source ends and its target is known to be stopped → `ended`/`empty`,
 *    no reconnect. (Previously a stopped container's logs were re-requested
 *    every 2s forever, appending the same tail each time.)
 * 2. Otherwise — target running or unknown, or the source threw — reconnect
 *    with exponential backoff.
 * 3. Backoff resets only after an attempt delivered at least one accepted item,
 *    so a source that keeps ending without new data eventually gives up.
 * 4. {@link resume} restarts a finished stream once its target runs again.
 *
 * One instance per selection: {@link stop} is final, and late items from an
 * aborted attempt are dropped.
 */
export class FollowStream<T> {
  private readonly opts: FollowStreamOptions<T>;
  private readonly scheduler: ReconnectScheduler;
  private controller: AbortController | null = null;
  private generation = 0;
  private stopped = false;
  private started = false;
  private attemptActive = false;
  private waiting = false;
  private everReceived = false;
  private _state: FollowStreamState = 'loading';

  constructor(opts: FollowStreamOptions<T>) {
    this.opts = opts;
    this.scheduler = opts.scheduler ?? new ReconnectScheduler();
  }

  get state(): FollowStreamState {
    return this._state;
  }

  start(): void {
    if (this.started || this.stopped) return;
    this.started = true;
    this.setState('loading');
    void this.run(false);
  }

  stop(): void {
    this.stopped = true;
    this.generation++;
    this.controller?.abort();
    this.controller = null;
    this.scheduler.clear();
    this.waiting = false;
  }

  /**
   * The target may have started again: a stream that ended because its target
   * stopped reconnects at once if the target is now running. Streams that are
   * backing off or gave up (`error`) are left alone — callers invoke this on
   * every state change, and resetting their backoff here would retry a
   * permanently failing source (e.g. `--log-driver=none`) forever.
   */
  resume(): void {
    if (!this.started || this.stopped || this.attemptActive) return;
    if (this._state !== 'ended' && this._state !== 'empty') return;
    if (this.opts.isTargetRunning?.() !== true) return;
    this.scheduler.clear();
    this.scheduler.reset();
    this.waiting = false;
    this.setState('reconnecting');
    void this.run(true);
  }

  private setState(state: FollowStreamState, message?: string): void {
    this._state = state;
    this.opts.onState?.(state, message);
  }

  private async run(reconnect: boolean): Promise<void> {
    if (this.stopped) return;
    const generation = ++this.generation;
    const controller = new AbortController();
    this.controller = controller;
    this.attemptActive = true;
    const current = () => !this.stopped && generation === this.generation && !controller.signal.aborted;

    let productive = false;
    let failure: unknown;
    try {
      for await (const item of this.opts.open(controller.signal, { reconnect })) {
        if (!current()) return;
        if (this.opts.accept && !this.opts.accept(item)) continue;
        if (!productive) {
          productive = true;
          this.everReceived = true;
          this.scheduler.reset();
          this.setState('live');
        }
        this.opts.onItem(item);
      }
    } catch (err) {
      if (!current()) return;
      failure = err;
      this.opts.onError?.(err);
    } finally {
      if (generation === this.generation) this.attemptActive = false;
    }
    if (!current()) return;
    this.opts.onAttemptEnd?.();

    if (failure === undefined && this.opts.isTargetRunning?.() === false) {
      this.setState(this.everReceived ? 'ended' : 'empty');
      return;
    }

    this.setState('reconnecting', failure === undefined ? undefined : errorText(failure));
    this.waiting = true;
    const scheduled = this.scheduler.schedule(() => {
      this.waiting = false;
      if (current()) void this.run(true);
    });
    if (!scheduled) {
      this.waiting = false;
      this.setState('error', GAVE_UP);
    }
  }
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
