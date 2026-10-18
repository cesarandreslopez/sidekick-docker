import type { HelpBinding, KeyCategory } from './keyRegistry';

export type HelpLine =
  | { kind: 'header'; title: string }
  | { kind: 'entry'; keys: string; label: string; dimmed: boolean; danger: boolean }
  | { kind: 'blank' };

const CATEGORY_ORDER: KeyCategory[] = ['Navigation', 'View', 'Filters & Sort', 'System'];

/** Rows the overlay spends outside the body: padding (2), title (1), blank + footer (2). */
export const HELP_CHROME_ROWS = 5;
/** Below this width the help stays in one column. */
export const HELP_TWO_COLUMN_MIN_WIDTH = 96;

/**
 * The help content as sections of lines: global bindings by category (every
 * key alias shown, not only the first), then the active panel's actions.
 */
export function buildHelpSections(
  bindings: readonly HelpBinding[],
  actions: readonly { key: string; label: string; confirm?: boolean }[],
  panelTitle: string,
): HelpLine[][] {
  const sections: HelpLine[][] = [];
  for (const category of CATEGORY_ORDER) {
    const entries = bindings.filter(b => b.category === category);
    if (entries.length === 0) continue;
    sections.push([
      { kind: 'header', title: category },
      ...entries.map((b): HelpLine => ({ kind: 'entry', keys: b.keys.join(' '), label: b.available ? b.label : `${b.label} (not here)`, dimmed: !b.available, danger: false })),
    ]);
  }
  if (actions.length > 0) {
    sections.push([
      { kind: 'header', title: `${panelTitle} Actions` },
      ...actions.map((a): HelpLine => ({ kind: 'entry', keys: a.key, label: a.label, dimmed: false, danger: a.confirm === true })),
    ]);
  }
  return sections;
}

export interface HelpLayout {
  /** One or two columns of lines, already windowed to the visible rows. */
  columns: HelpLine[][];
  columnWidth: number;
  /** Width of the key badge column. */
  keyWidth: number;
  scroll: number;
  maxScroll: number;
  bodyRows: number;
}

/**
 * Fit the help into the terminal. The old overlay rendered ~50 rows into
 * whatever it got, so on a 24-row terminal everything after "View" —
 * including the panel's own actions — was cut off. Wide terminals get two
 * balanced columns; whatever still does not fit scrolls (j/k).
 */
export function layoutHelp(sections: readonly HelpLine[][], rows: number, cols: number, scroll: number): HelpLayout {
  const bodyRows = Math.max(1, rows - HELP_CHROME_ROWS);
  const withGaps = (secs: readonly HelpLine[][]) => secs.flatMap((s, i) => (i === 0 ? s : [{ kind: 'blank' } as HelpLine, ...s]));
  const total = sections.reduce((n, s) => n + s.length, 0) + Math.max(0, sections.length - 1);

  let columns: HelpLine[][];
  if (cols >= HELP_TWO_COLUMN_MIN_WIDTH && sections.length > 1 && total > bodyRows) {
    // Split at the section boundary that best balances the two columns.
    let best = 1;
    let bestDiff = Infinity;
    for (let k = 1; k < sections.length; k++) {
      const diff = Math.abs(withGaps(sections.slice(0, k)).length - withGaps(sections.slice(k)).length);
      if (diff < bestDiff) { bestDiff = diff; best = k; }
    }
    columns = [withGaps(sections.slice(0, best)), withGaps(sections.slice(best))];
  } else {
    columns = [withGaps(sections)];
  }

  const longest = Math.max(...columns.map(c => c.length));
  const maxScroll = Math.max(0, longest - bodyRows);
  const clamped = Math.max(0, Math.min(scroll, maxScroll));
  const keyLen = Math.max(0, ...sections.flat().map(l => (l.kind === 'entry' ? l.keys.length : 0)));
  return {
    columns: columns.map(c => c.slice(clamped, clamped + bodyRows)),
    columnWidth: Math.floor((cols - 4) / columns.length),
    keyWidth: Math.min(18, keyLen + 2),
    scroll: clamped,
    maxScroll,
    bodyRows,
  };
}
