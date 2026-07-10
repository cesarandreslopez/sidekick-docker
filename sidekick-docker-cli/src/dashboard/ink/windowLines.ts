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
