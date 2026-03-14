export const INITIAL_RECONNECT_DELAY = 2000;
export const MAX_RECONNECT_DELAY = 30_000;
export const MAX_RECONNECT_ATTEMPTS = 10;

/**
 * Manages reconnection scheduling with exponential backoff.
 * Used by stream managers to auto-reconnect when a stream ends or errors.
 */
export class ReconnectScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;
  private delay = INITIAL_RECONNECT_DELAY;

  /** Schedule a reconnect callback with exponential backoff. Returns false if max attempts reached. */
  schedule(callback: () => void): boolean {
    if (this.attempts >= MAX_RECONNECT_ATTEMPTS) {
      return false;
    }

    this.clear();
    this.timer = setTimeout(() => {
      this.timer = null;
      this.attempts++;
      this.delay = Math.min(this.delay * 2, MAX_RECONNECT_DELAY);
      callback();
    }, this.delay);

    return true;
  }

  /** Clear any pending reconnect timer. */
  clear(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /** Reset backoff state (call after a successful stream). */
  reset(): void {
    this.attempts = 0;
    this.delay = INITIAL_RECONNECT_DELAY;
  }
}
