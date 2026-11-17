import stringWidth from 'string-width';

export interface FilterBarLayout {
  /** The prompt itself: ` ${label}${value}█ `, with the value cut from the left when needed. */
  badge: string;
  /** The extras (match count, key hints) that still fit after it, in order. */
  extras: string[];
}

/** The longest end of `text` that fits in `width` cells. */
function tailFitting(text: string, width: number): string {
  const chars = [...text];
  let used = 0;
  let start = chars.length;
  while (start > 0) {
    const w = stringWidth(chars[start - 1]);
    if (used + w > width) break;
    used += w;
    start--;
  }
  return chars.slice(start).join('');
}

/**
 * Fit a filter prompt into `width` cells. The bars had no width, so typing a
 * long query (or a narrow terminal) wrapped them onto a second row and broke
 * the frame. Now the prompt always shows its end — where the cursor is —
 * behind "…", and the extras are dropped from the last one back until the
 * rest fits.
 */
export function filterBarLayout(label: string, value: string, extras: readonly string[], width: number): FilterBarLayout {
  const frame = (v: string) => ` ${label}${v}█ `;
  const budget = Math.max(0, width);
  let badge = frame(value);
  if (stringWidth(badge) > budget) {
    const room = Math.max(0, budget - stringWidth(frame('')) - 1);
    badge = frame(`…${tailFitting(value, room)}`);
  }
  const kept: string[] = [];
  let used = stringWidth(badge);
  for (const extra of extras) {
    const w = stringWidth(extra);
    if (used + w > budget) break;
    kept.push(extra);
    used += w;
  }
  return { badge, extras: kept };
}
