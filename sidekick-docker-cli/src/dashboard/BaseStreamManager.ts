import { ReconnectScheduler } from 'sidekick-docker-shared';
import { debugLog } from '../utils/debug';

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

  private streamController: AbortController | null = null;
  private streamGeneration = 0;

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
    this.streamController = new AbortController();
    this.streamGeneration++;
    this.onBeforeStream();
    this.streamPromise = this.runStream(id, this.streamController.signal, this.streamGeneration);
  }

  private async runStream(id: TId, signal: AbortSignal, generation: number): Promise<void> {
    try {
      for await (const item of this.createStream(id, signal)) {
        if (signal.aborted || this.aborted || !this.isSameId(id, this.currentId)) break;
        this.processItem(id, item);
        this.onChange();
      }
      this.reconnect.reset();
    } catch (err) {
      if (signal.aborted) return;
      debugLog(`${this.streamLabel} stream error:`, err);
    }

    if (!signal.aborted && !this.aborted && this.isSameId(id, this.currentId) && generation === this.streamGeneration) {
      const scheduled = this.reconnect.schedule(() => {
        if (!this.aborted && this.isSameId(id, this.currentId) && generation === this.streamGeneration) {
          this.streamController = new AbortController();
          this.onBeforeStream();
          this.streamPromise = this.runStream(id, this.streamController.signal, generation);
        }
      });
      if (!scheduled) {
        debugLog(`${this.streamLabel} stream: gave up reconnecting for ${this.idLabel(id)}`);
      }
    }
  }

  stop(): void {
    this.aborted = true;
    this.currentId = this.emptyId();
    this.streamController?.abort();
    this.streamController = null;
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
  protected abstract createStream(id: TId, signal: AbortSignal): AsyncIterable<TItem>;

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
