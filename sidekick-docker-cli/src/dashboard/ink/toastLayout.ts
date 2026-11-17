import type { ToastEntry, ToastSeverity } from './dashboardTypes';

const BASE_DURATION: Record<ToastSeverity, number> = { error: 6000, warning: 3000, info: 2500, success: 2000 };

/**
 * How long a toast stays up: the severity's base, plus reading time for long
 * messages (a Docker error with a path in it needs longer than "Started web").
 * An explicit duration from the caller wins.
 */
export function toastDuration(severity: ToastSeverity, message: string, explicit?: number): number {
  if (explicit !== undefined) return explicit;
  const extra = Math.max(0, message.length - 40) * 50;
  const cap = severity === 'error' || severity === 'warning' ? 15_000 : 6000;
  return Math.min(BASE_DURATION[severity] + extra, cap);
}

/**
 * Rows a toast may wrap to. Errors, warnings and info (the "Refreshed —
 * images unavailable: …" kind) get three so the reason survives; a success
 * toast is a short confirmation.
 */
export function toastMaxLines(severity: ToastSeverity): number {
  return severity === 'success' ? 1 : 3;
}

/**
 * Word-wrap a toast message into at most `maxLines` lines of `width`
 * characters; the last line ends in "…" when text was cut. Errors get three
 * lines so the actual reason survives instead of being truncated away.
 */
export function wrapToast(message: string, width: number, maxLines: number): string[] {
  const w = Math.max(10, width);
  const words = message.replace(/\s+/g, ' ').trim().split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    let rest = word;
    while (rest.length > w) {
      // A single word longer than the width (a path, an ID) is hard-broken.
      if (line) { lines.push(line); line = ''; }
      lines.push(rest.slice(0, w));
      rest = rest.slice(w);
    }
    if (!line) line = rest;
    else if (line.length + 1 + rest.length <= w) line += ` ${rest}`;
    else { lines.push(line); line = rest; }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  const last = kept[maxLines - 1];
  kept[maxLines - 1] = `${last.slice(0, Math.max(0, w - 1))}…`;
  return kept;
}

/**
 * The toast queue after adding `toast`, at most `max` long.
 *
 * - The same message at the same severity replaces the earlier copy instead
 *   of stacking (three "Not available here" filled the whole stack).
 * - When full, the oldest toast that is not a progress spinner goes first.
 *   Evicting the oldest outright could drop a running action's spinner,
 *   which never expires on its own, while stale results stayed on screen.
 */
export function queueToast(toasts: readonly ToastEntry[], toast: ToastEntry, max: number): ToastEntry[] {
  const kept = toast.progress
    ? [...toasts]
    : toasts.filter(t => t.progress || t.message !== toast.message || t.severity !== toast.severity);
  const queue = [...kept, toast];
  while (queue.length > max) {
    const evict = queue.findIndex(t => !t.progress);
    queue.splice(evict >= 0 ? evict : 0, 1);
  }
  return queue;
}
