import { describe, expect, it } from 'vitest';
import stringWidth from 'string-width';
import { filterBarLayout } from './filterBarLayout';

const extras = ['  3 of 9 containers', '  Enter: apply  Esc: clear'];

describe('filterBarLayout (Missed-1)', () => {
  it('shows everything when it fits', () => {
    const layout = filterBarLayout('⌕ ', 'web', extras, 80);
    expect(layout.badge).toBe(' ⌕ web█ ');
    expect(layout.extras).toEqual(extras);
  });

  it('drops the extras from the last one back before touching the query', () => {
    const layout = filterBarLayout('⌕ ', 'web', extras, 30);
    expect(layout.badge).toBe(' ⌕ web█ ');
    expect(layout.extras).toEqual(['  3 of 9 containers']);
    expect(filterBarLayout('⌕ ', 'web', extras, 12).extras).toEqual([]);
  });

  it('cuts a long query from the left, keeping the end being typed, and never exceeds the width', () => {
    const query = 'a-very-long-filter-query-that-keeps-going';
    for (const width of [10, 20, 33]) {
      const layout = filterBarLayout('Log filter (exact): ', query, ['  Tab: toggle mode'], width);
      const total = stringWidth(layout.badge) + layout.extras.reduce((n, e) => n + stringWidth(e), 0);
      if (width >= stringWidth(' Log filter (exact): …█ ')) expect(total).toBeLessThanOrEqual(width);
    }
    const layout = filterBarLayout('⌕ ', query, [], 20);
    expect(layout.badge).toBe(' ⌕ …at-keeps-going█ ');
    expect(stringWidth(layout.badge)).toBe(20);
  });
});
