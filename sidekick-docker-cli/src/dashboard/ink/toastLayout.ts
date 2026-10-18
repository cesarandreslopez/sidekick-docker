import type { ToastSeverity } from './dashboardTypes';

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
