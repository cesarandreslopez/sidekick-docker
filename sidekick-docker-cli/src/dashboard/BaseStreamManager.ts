import { FollowStream } from 'sidekick-docker-shared';
import type { FollowStreamState } from 'sidekick-docker-shared';
import { debugLog } from '../utils/debug';

export interface StreamManagerOptions<TId> {
  /**
   * Whether the selected target is running (`undefined` = unknown). Lets a
   * stream of a stopped container end instead of replaying its tail forever.
   */
  isTargetRunning?: (id: TId) => boolean | undefined;
}

/**
 * Abstract base for selection-driven stream managers.
 * Handles the common lifecycle: select → stream → reconnect → stop/dispose.
 * Reconnect policy (when to retry, backoff, ending for stopped targets) lives
 * in the shared FollowStream, so the TUI and VS Code behave the same.
 *
 * @typeParam TId   - identifier type for the selected item (e.g. string | null)
 * @typeParam TItem - type of items yielded by the stream
 */
export abstract class BaseStreamManager<TId, TItem> {
  protected currentId: TId;
  protected onChange: () => void;

  private stream: FollowStream<TItem> | null = null;
  private readonly isTargetRunning?: (id: TId) => boolean | undefined;

  constructor(onChange: () => void, options: StreamManagerOptions<TId> = {}) {
    this.onChange = onChange;
    this.isTargetRunning = options.isTargetRunning;
    this.currentId = this.emptyId();
  }

  /** Switch to streaming for a different identifier. */
  async select(id: TId): Promise<void> {
    if (this.isSameId(id, this.currentId)) return;

    this.stop();
    this.currentId = id;
    this.onClear();

    if (!this.isValidId(id)) return;

    const stream = new FollowStream<TItem>({
      open: (signal, attempt) => {
        this.onBeforeStream();
        return this.createStream(id, signal, attempt);
      },
      accept: item => this.acceptItem?.(item) ?? true,
      onItem: (item) => {
        this.processItem(id, item);
        this.onChange();
      },
      isTargetRunning: this.isTargetRunning ? () => this.isTargetRunning?.(id) : undefined,
      onError: err => debugLog(`${this.streamLabel} stream error:`, err),
      onState: (state) => {
        if (state === 'error') debugLog(`${this.streamLabel} stream: gave up reconnecting for ${this.idLabel(id)}`);
        this.onStreamState?.(state);
      },
    });
    this.stream = stream;
    stream.start();
  }

  /**
   * The selected target may have changed state (e.g. a stopped container
   * started again): resume a finished stream if it is now running.
   */
  targetStateChanged(): void {
    this.stream?.resume();
  }

  /** Lifecycle of the current stream, or null when nothing is selected. */
  getStreamState(): FollowStreamState | null {
    return this.stream?.state ?? null;
  }

  stop(): void {
    this.stream?.stop();
    this.stream = null;
    this.currentId = this.emptyId();
    this.onStop();
  }

  dispose(): void {
    this.stop();
  }

  // ── Abstract: subclasses must implement ──

  /** Human-readable label for log messages (e.g. 'log', 'stats'). */
  protected abstract readonly streamLabel: string;

  /** The "nothing selected" value for TId. */
  protected abstract emptyId(): TId;

  /** Whether two identifiers refer to the same selection. */
  protected abstract isSameId(a: TId, b: TId): boolean;

  /** Whether a selection is valid (i.e. not "nothing selected"). */
  protected abstract isValidId(id: TId): boolean;

  /** Human-readable label for a given identifier (for log messages). */
  protected abstract idLabel(id: TId): string;

  /** Create the async iterable that produces stream items. `reconnect` is true after the first attempt. */
  protected abstract createStream(id: TId, signal: AbortSignal, attempt: { reconnect: boolean }): AsyncIterable<TItem>;

  /** Process a single item from the stream. */
  protected abstract processItem(id: TId, item: TItem): void;

  /** Reset data when selection changes. */
  protected abstract onClear(): void;

  // ── Optional hooks ──

  /** Return false to drop an item replayed by a reconnect. Unset accepts everything. */
  protected acceptItem?(item: TItem): boolean;

  /** Called before streaming starts (including reconnects). */
  protected onBeforeStream(): void {}

  /** Called when stop() is invoked. */
  protected onStop(): void {}

  /** Called on every stream lifecycle change (see getStreamState). */
  protected onStreamState?(state: FollowStreamState): void;
}
