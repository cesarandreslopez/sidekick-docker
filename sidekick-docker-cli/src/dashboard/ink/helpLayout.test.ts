import { describe, expect, it } from 'vitest';
import { buildHelpSections, layoutHelp, HELP_CHROME_ROWS } from './helpLayout';
import type { HelpBinding } from './keyRegistry';

const binding = (label: string, category: HelpBinding['category'], keys = ['x'], available = true): HelpBinding => ({ keys, label, category, available });
const bindings: HelpBinding[] = [
  ...Array.from({ length: 10 }, (_, i) => binding(`nav ${i}`, 'Navigation')),
  ...Array.from({ length: 6 }, (_, i) => binding(`view ${i}`, 'View')),
  binding('Move', 'Navigation', ['j/k', '↑/↓']),
  binding('Log filter', 'Filters & Sort', ['f'], false),
  ...Array.from({ length: 5 }, (_, i) => binding(`sys ${i}`, 'System')),
];
const actions = [{ key: 's', label: 'Start' }, { key: 'd', label: 'Remove', confirm: true }];

describe('buildHelpSections', () => {
  it('lists every key alias and marks unavailable and destructive entries', () => {
    const lines = buildHelpSections(bindings, actions, 'Containers').flat();
    expect(lines).toContainEqual({ kind: 'entry', keys: 'j/k ↑/↓', label: 'Move', dimmed: false, danger: false });
    expect(lines).toContainEqual({ kind: 'entry', keys: 'f', label: 'Log filter (not here)', dimmed: true, danger: false });
    expect(lines).toContainEqual({ kind: 'entry', keys: 'd', label: 'Remove', dimmed: false, danger: true });
    expect(lines.at(-3)).toEqual({ kind: 'header', title: 'Containers Actions' });
  });
});

describe('layoutHelp', () => {
  const sections = buildHelpSections(bindings, actions, 'Containers');
  const all = (cols: HelpLine[][]) => cols.flat();
  type HelpLine = ReturnType<typeof buildHelpSections>[number][number];

  it('fits in one column when there is room', () => {
    const l = layoutHelp(sections, 60, 80, 0);
    expect(l.columns).toHaveLength(1);
    expect(l.maxScroll).toBe(0);
    expect(all(l.columns).some(x => x.kind === 'header' && x.title === 'Containers Actions')).toBe(true);
  });

  it('splits into two balanced columns on a wide, short terminal', () => {
    const l = layoutHelp(sections, 24, 120, 0);
    expect(l.columns).toHaveLength(2);
    expect(l.columns.every(c => c.length <= l.bodyRows)).toBe(true);
  });

  it('scrolls whatever still does not fit, clamped to the end', () => {
    const narrow = layoutHelp(sections, 24, 80, 0);
    expect(narrow.maxScroll).toBeGreaterThan(0);
    const end = layoutHelp(sections, 24, 80, 999);
    expect(end.scroll).toBe(narrow.maxScroll);
    expect(all(end.columns).at(-1)).toEqual({ kind: 'entry', keys: 'd', label: 'Remove', dimmed: false, danger: true });
  });
});

describe('help chrome (T21)', () => {
  it('budgets the status bar drawn under the overlay, so it is never a row too tall', () => {
    // padding 2 + title 1 + blank 1 + footer 1 + status bar 1
    expect(HELP_CHROME_ROWS).toBe(6);
    const l = layoutHelp(buildHelpSections(bindings, actions, 'Containers'), 24, 80, 0);
    expect(l.bodyRows).toBe(24 - 6);
  });
});
