/**
 * TUI colour tokens. Components and panels take their accent from here, never
 * from a hex literal (lint enforces this under dashboard/).
 *
 * The brand navy (#2B4C7E, BRAND_COLOR_HEX in shared) is ~2.3:1 against a
 * black terminal background — focus borders, the selected row, and every
 * Env/Config key were close to invisible on the dark terminals most people
 * use. ACCENT is a mid-tone of the same blue that holds up on dark *and*
 * light backgrounds; the navy survives only as a fill behind white text.
 */

/** Text, borders, focus and selection highlights. */
export const ACCENT = '#5B8BD9';
/** RGB of {@link ACCENT}, for raw truecolor escapes in formatters.ts. */
export const ACCENT_RGB: readonly [number, number, number] = [0x5b, 0x8b, 0xd9];
/** Background for filled badges and bars that carry white text. */
export const ACCENT_FILL = '#2B4C7E';

/**
 * Background for the floating overlays (confirm, actions menu, sort). Ink
 * paints an absolutely positioned box only where it has text, so the list
 * and logs underneath showed through its padding and short rows. Any
 * backgroundColor makes Ink fill the box first; 'none' fills it with plain
 * spaces — no colour, so it suits dark and light terminals alike.
 */
export const OVERLAY_FILL = 'none';

function luminance(hex: string): number {
  const n = parseInt(hex.replace('#', ''), 16);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel((n >> 16) & 0xff) + 0.7152 * channel((n >> 8) & 0xff) + 0.0722 * channel(n & 0xff);
}

/** WCAG contrast ratio between two `#rrggbb` colours (1–21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
