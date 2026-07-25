/**
 * Geometry for the two tab bars, shared between the components that render
 * them and `useMouseHandler`, which hit-tests clicks against them.
 *
 * Kept in one place for the same reason `overlayHitTest.ts` exists: the mouse
 * handler previously re-derived these widths by hand from the JSX, so any
 * change to the markup silently moved the click targets.
 */

export interface TabCount {
  total: number;
  running?: number;
}

/** The count suffix rendered after a panel title, e.g. " 2/3" or " 12". */
export function panelCountLabel(count: TabCount | undefined): string {
  if (!count) return '';
  return count.running !== undefined ? ` ${count.running}/${count.total}` : ` ${count.total}`;
}

/** Width of the trailing layout indicator, e.g. "z: Expanded ▸". */
export function layoutIndicatorWidth(layoutMode: string | undefined): number {
  const name = layoutMode === 'expanded' ? 'Expanded' : layoutMode === 'wide' ? 'Wide' : 'Normal';
  return `z: ${name} ▸`.length;
}

/**
 * Rendered width of one panel tab: " {key} {title}{count} ".
 * In compact mode the title is dropped, leaving " {key}{count} ".
 */
export function panelTabWidth(
  shortcutKey: number,
  title: string,
  count: TabCount | undefined,
  compact: boolean,
): number {
  const keyLen = String(shortcutKey).length;
  const countLen = panelCountLabel(count).length;
  // Leading space + key + space + title + count + trailing space, then the
  // 1-column marginRight between tabs.
  return compact
    ? 1 + keyLen + countLen + 1 + 1
    : 1 + keyLen + 1 + title.length + countLen + 1 + 1;
}

/**
 * Whether the tab bar must drop panel titles to fit.
 *
 * Without this the tabs shrink and their text *wraps*, turning a one-row bar
 * into three rows of fragments ("Conta"/"ners") and shifting every row the
 * mouse handler counts on. Reserves room for the layout indicator; the
 * rotating phrase is expendable and simply gets no space.
 */
export function shouldCompactTabs(
  panels: { shortcutKey: number; title: string }[],
  counts: (TabCount | undefined)[],
  layoutMode: string | undefined,
  totalWidth: number,
): boolean {
  const full = panels.reduce(
    (sum, p, i) => sum + panelTabWidth(p.shortcutKey, p.title, counts[i], false),
    0,
  );
  return full + layoutIndicatorWidth(layoutMode) > totalWidth;
}

/**
 * Width of the detail strip's trailing hint ("[/] cycle tabs"). The
 * follow-paused variant is longer, but the hint is only dropped when space is
 * tight, so sizing on the common case keeps the geometry stable.
 */
export const DETAIL_TAB_SUFFIX_LENGTH = '[/] cycle tabs'.length;

/** Rendered width of one detail tab: " {label} " plus its separator. */
export function detailTabWidth(label: string): number {
  return label.length + 3;
}

export interface DetailTabWindow {
  /** Index of the first rendered tab. */
  start: number;
  /** Number of tabs rendered, starting at `start`. */
  count: number;
  /** Whether the trailing hint had room. */
  showSuffix: boolean;
  /** A '‹' marker occupies one column before the first tab. */
  hasLeftMarker: boolean;
}

/**
 * Which detail tabs are rendered at a given pane width.
 *
 * Containers has six tabs; at 80 columns those plus the trailing hint exceed
 * the pane, and letting them shrink makes Ink wrap them onto a second row —
 * which shifts every row `useMouseHandler` counts on. Drop the hint first,
 * then window the strip so the active tab stays visible.
 *
 * Shared with the mouse handler so click targets track what is drawn.
 */
export function detailTabWindow(
  labels: string[],
  activeIndex: number,
  paneWidth: number,
  suffixLength: number,
): DetailTabWindow {
  const total = labels.reduce((sum, l) => sum + detailTabWidth(l), 0);
  const showSuffix = total + suffixLength + 1 <= paneWidth;
  const budget = showSuffix ? paneWidth - suffixLength - 1 : paneWidth;

  let start = 0;
  if (total > budget) {
    let used = 0;
    for (let i = 0; i <= activeIndex && i < labels.length; i++) {
      used += detailTabWidth(labels[i]);
      while (used > budget && start < i) {
        used -= detailTabWidth(labels[start]);
        start++;
      }
    }
  }

  let remaining = budget;
  let count = 0;
  for (let i = start; i < labels.length; i++) {
    const w = detailTabWidth(labels[i]);
    if (w > remaining) break;
    remaining -= w;
    count++;
  }

  return { start, count: Math.max(1, count), showSuffix, hasLeftMarker: start > 0 };
}
