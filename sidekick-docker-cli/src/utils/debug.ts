import { errorMessage } from 'sidekick-docker-shared';

/**
 * Diagnostic logging for the TUI.
 *
 * `console.debug` is an alias for `console.log` and therefore writes to
 * **stdout** — the stream Ink owns while the dashboard is mounted. Every such
 * call punched a hole in the rendered frame and shifted the layout, for output
 * the user never asked to see.
 *
 * These go to stderr instead (redirectable with `2>debug.log` without
 * disturbing the UI) and only when explicitly enabled.
 *
 * Enable with `SIDEKICK_DEBUG_STREAMS=1` or `DEBUG=1`.
 */
export function isDebugEnabled(): boolean {
  return process.env.SIDEKICK_DEBUG_STREAMS === '1' || Boolean(process.env.DEBUG);
}

/** Log a diagnostic message. No-op unless debugging is enabled. */
export function debugLog(message: string, detail?: unknown): void {
  if (!isDebugEnabled()) return;
  const suffix = detail === undefined ? '' : ` ${errorMessage(detail)}`;
  process.stderr.write(`[sidekick] ${message}${suffix}\n`);
}
