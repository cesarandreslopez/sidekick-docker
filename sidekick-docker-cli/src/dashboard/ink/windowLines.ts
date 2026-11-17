/**
 * Windowing with the ▲/▼ scroll-indicator rows reserved INSIDE the viewport
 * budget, so bordered panes never render more rows than they have.
 */
export interface WindowedLines<T> {
  visible: T[];
  above: number;
  below: number;
  hasUp: boolean;
  hasDown: boolean;
  /** Rows actually used by content (visible.length). */
  contentRows: number;
}

export function windowLines<T>(items: T[], scrollOffset: number, viewportHeight: number): WindowedLines<T> {
  const hasUp = scrollOffset > 0;
  let budget = Math.max(0, viewportHeight - (hasUp ? 1 : 0));
  const hasDown = scrollOffset + budget < items.length;
  if (hasDown) budget = Math.max(0, budget - 1);

  const visible = items.slice(scrollOffset, scrollOffset + budget);
  return {
    visible,
    above: scrollOffset,
    below: Math.max(0, items.length - scrollOffset - budget),
    hasUp,
    hasDown: scrollOffset + budget < items.length,
    contentRows: visible.length,
  };
}

/**
 * Largest scroll offset that still shows the last line, accounting for the
 * ▲ indicator row that appears once scrolled. Keep in sync with windowLines.
 */
export function maxScrollOffset(totalLines: number, viewportHeight: number): number {
  if (totalLines <= viewportHeight) return 0;
  return Math.max(0, totalLines - Math.max(1, viewportHeight - 1));
}

/**
 * A list window's first row, re-clamped to the current list and viewport:
 * no further than the last full page, and keeping the selection visible
 * (inside the conservative budget that leaves room for both ▲ and ▼).
 * Applied at read time, so a terminal resize or a shrinking list cannot
 * leave the window scrolled past the end with blank rows.
 */
export function clampWindowOffset(offset: number, selectedIndex: number, totalItems: number, viewportHeight: number): number {
  const maxVisible = Math.max(1, viewportHeight - 2);
  let next = offset;
  if (selectedIndex >= 0 && selectedIndex < totalItems) {
    if (selectedIndex < next) next = selectedIndex;
    else if (selectedIndex >= next + maxVisible) next = selectedIndex - maxVisible + 1;
  }
  return Math.max(0, Math.min(next, maxScrollOffset(totalItems, viewportHeight)));
}

/**
 * Width of each compare column: the pane minus its borders (2) and the
 * " │ " divider (3), halved. One function, so the columns that are drawn and
 * the ones the mouse is tested against cannot drift apart.
 */
export function compareColumnWidth(paneWidth: number): number {
  return Math.max(10, Math.floor((paneWidth - 5) / 2));
}

/**
 * Which compare column a screen column `x` falls in. The pane starts at
 * `paneLeft` with a one-cell border; the left column is followed by the
 * " │ " divider, whose middle cell is the boundary.
 */
export function compareColumnAt(x: number, paneLeft: number, paneWidth: number): 'primary' | 'secondary' {
  const divider = paneLeft + 1 + compareColumnWidth(paneWidth) + 1;
  return x <= divider ? 'primary' : 'secondary';
}

/** Below this column width the compare view drops log timestamps ("HH:MM:SS.mmm " is 13 cells). */
export const COMPARE_TIMESTAMP_MIN_WIDTH = 40;

/** One row of a compare column: content, or a ▲/▼ indicator. */
export interface ColumnRow {
  text: string;
  indicator: boolean;
  /** The ▼ row of a column whose follow is paused (it carries the resume hint). */
  paused?: boolean;
}

/**
 * Exactly `viewportHeight` rows for one compare column, windowed on its own:
 * ▲/▼ rows only where that column has more, blank rows below short content.
 * The columns used to share one budget, so a ▼ row in the scrolled-back
 * column hid the newest line of the column that was following.
 */
export function compareColumnRows(lines: string[], scrollOffset: number, viewportHeight: number, pausedSuffix = ''): ColumnRow[] {
  const win = windowLines(lines, scrollOffset, viewportHeight);
  const rows: ColumnRow[] = [];
  if (win.hasUp) rows.push({ text: `▲ (${win.above} more)`, indicator: true });
  for (const line of win.visible) rows.push({ text: line, indicator: false });
  if (win.hasDown) rows.push({ text: `▼ (${win.below} more)${pausedSuffix}`, indicator: true, paused: pausedSuffix !== '' });
  while (rows.length < viewportHeight) rows.push({ text: '', indicator: false });
  return rows.slice(0, Math.max(0, viewportHeight));
}
