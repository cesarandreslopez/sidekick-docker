import { truncate } from 'sidekick-docker-shared';

export interface TableColumn {
  header: string;
  /** Floor below which a flex column never shrinks. Also a minimum natural width. */
  min?: number;
  /** Hard cap on column width; overflowing cells are truncated. */
  max?: number;
  /** Column may shrink below its natural width (down to min) to fit totalWidth. */
  flex?: boolean;
  /** Applied to the padded cell of data rows (post-layout, e.g. for color). */
  decorate?: (cell: string, rowIndex: number) => string;
}

const GUTTER = 2;

/**
 * Render a plain-text table as lines: header, divider, then one line per row.
 *
 * Column width is max(header, widest cell), clamped to [min, max]. When the
 * total exceeds `totalWidth`, flex columns shrink (widest first) down to their
 * min. Cells wider than their column are truncated. Pass `totalWidth: null`
 * for natural widths (piped output).
 */
export function renderTable(columns: TableColumn[], rows: string[][], totalWidth: number | null): string[] {
  const widths = columns.map((col, i) => {
    let w = col.header.length;
    for (const row of rows) w = Math.max(w, (row[i] ?? '').length);
    if (col.max !== undefined) w = Math.min(w, col.max);
    if (col.min !== undefined) w = Math.max(w, col.min);
    return w;
  });

  const gutterTotal = GUTTER * Math.max(0, columns.length - 1);
  if (totalWidth !== null) {
    let deficit = widths.reduce((a, b) => a + b, 0) + gutterTotal - totalWidth;
    while (deficit > 0) {
      // Shrink the widest flex column still above its floor.
      let target = -1;
      for (let i = 0; i < columns.length; i++) {
        if (!columns[i].flex) continue;
        if (widths[i] <= (columns[i].min ?? 1)) continue;
        if (target === -1 || widths[i] > widths[target]) target = i;
      }
      if (target === -1) break;
      widths[target]--;
      deficit--;
    }
  }

  const renderRow = (cells: string[], rowIndex: number | null): string =>
    columns
      .map((col, i) => {
        const fitted = truncate(cells[i] ?? '', widths[i]);
        // Last column is not padded so lines carry no trailing whitespace.
        const cell = i === columns.length - 1 ? fitted : fitted.padEnd(widths[i]);
        return rowIndex !== null && col.decorate ? col.decorate(cell, rowIndex) : cell;
      })
      .join(' '.repeat(GUTTER))
      .trimEnd();

  const actualWidth = widths.reduce((a, b) => a + b, 0) + gutterTotal;
  return [
    renderRow(columns.map(c => c.header), null),
    '-'.repeat(actualWidth),
    ...rows.map((row, i) => renderRow(row, i)),
  ];
}
