import wrapAnsi from 'wrap-ansi';
import stringWidth from 'string-width';

/**
 * Soft-wrap for the detail pane (the `w` toggle). Lines are split *before*
 * any scroll math, so follow, paging and mouse rows all count the rows that
 * are actually drawn — Ink's own wrap="wrap" would grow rows behind the
 * viewport budget's back. ANSI-aware: colours carry across the break, and
 * widths are measured in terminal cells, not UTF-16 units.
 */

/** Wrapped forms of recently drawn lines; the log tab re-renders the same strings constantly. */
const cache = new Map<string, string[]>();
let cacheWidth = -1;
const CACHE_LIMIT = 5000;

/** A continuation row's leading space (the one the break happened at), after any colour codes. */
const LEADING_SPACE = /^((?:\x1b\[[0-9;:]*m)*) /;

/** One line wrapped to `width` cells; a line that fits comes back as itself. */
export function wrapLine(line: string, width: number): string[] {
  if (stringWidth(line) <= width) return [line];
  // trim: false keeps indentation (Config, Env); only the break's own space goes.
  return wrapAnsi(line, width, { hard: true, trim: false })
    .split('\n')
    .map((row, i) => (i === 0 ? row : row.replace(LEADING_SPACE, '$1')));
}

/** Every line wrapped to `width` cells (at least 1). */
export function wrapDetailLines(lines: readonly string[], width: number): string[] {
  const w = Math.max(1, Math.floor(width));
  if (w !== cacheWidth || cache.size > CACHE_LIMIT) {
    cache.clear();
    cacheWidth = w;
  }
  const out: string[] = [];
  for (const line of lines) {
    let rows = cache.get(line);
    if (!rows) {
      rows = wrapLine(line, w);
      cache.set(line, rows);
    }
    for (const row of rows) out.push(row);
  }
  return out;
}
