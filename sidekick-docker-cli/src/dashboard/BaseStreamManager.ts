import { ReconnectScheduler, errorMessage } from 'sidekick-docker-shared';

/**
 * Abstract base for selection-driven stream managers.
 * Handles the common lifecycle: select → stream → reconnect → stop/dispose.
 *
 * @typeParam TId   - identifier type for the selected item (e.g. string | null)
 * @typeParam TItem - type of items yielded by the stream
 */
export abstract class BaseStreamManager<TId, TItem> {
  protected currentId: TId;
  protected aborted = false;
  protected streamPromise: Promise<void> | null = null;
  protected reconnect = new ReconnectScheduler();
  protected onChange: () => void;

  constructor(onChange: () => void) {
    this.onChange = onChange;
    this.currentId = this.emptyId();
  }

  /** Switch to streaming for a different identifier. */
  async select(id: TId): Promise<void> {
    if (this.isSameId(id, this.currentId)) return;

    this.stop();
    this.currentId = id;
    this.onClear();

    if (!this.isValidId(id)) return;

    this.aborted = false;
    this.reconnect.reset();
    this.onBeforeStream();
    this.streamPromise = this.runStream(id);
  }

  private async runStream(id: TId): Promise<void> {
    try {
      for await (const item of this.createStream(id)) {
        if (this.aborted || !this.isSameId(id, this.currentId)) break;
        this.processItem(id, item);
        this.onChange();
      }
      this.reconnect.reset();
    } catch (err) {
      console.debug(`${this.streamLabel} stream error:`, errorMessage(err));
    }

    if (!this.aborted && this.isSameId(id, this.currentId)) {
      const scheduled = this.reconnect.schedule(() => {
        if (!this.aborted && this.isSameId(id, this.currentId)) {
          this.onBeforeStream();
          this.streamPromise = this.runStream(id);
        }
      });
      if (!scheduled) {
        console.debug(`${this.streamLabel} stream: gave up reconnecting for ${this.idLabel(id)}`);
      }
    }
  }

  stop(): void {
    this.aborted = true;
    this.currentId = this.emptyId();
    this.streamPromise = null;
    this.reconnect.clear();
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

  /** Create the async iterable that produces stream items. */
  protected abstract createStream(id: TId): AsyncIterable<TItem>;

  /** Process a single item from the stream. */
  protected abstract processItem(id: TId, item: TItem): void;

  /** Reset data when selection changes. */
  protected abstract onClear(): void;

  // ── Optional hooks ──

  /** Called before streaming starts (including reconnects). */
  protected onBeforeStream(): void {}

  /** Called when stop() is invoked. */
  protected onStop(): void {}
}
