import { describe, it, expect } from 'vitest';
import {
  panelCountLabel,
  panelTabWidth,
  shouldCompactTabs,
  detailTabWidth,
  detailTabWindow,
  DETAIL_TAB_SUFFIX_LENGTH,
} from './tabLayout';

/** The real panel set, which is what actually overflows at 80 columns. */
const PANELS = [
  { shortcutKey: 1, title: 'Containers' },
  { shortcutKey: 2, title: 'Services' },
  { shortcutKey: 3, title: 'Images' },
  { shortcutKey: 4, title: 'Volumes' },
  { shortcutKey: 5, title: 'Networks' },
];
const COUNTS = [{ total: 3, running: 2 }, { total: 0 }, { total: 21 }, { total: 1 }, { total: 3 }];

/** The Containers detail tabs, the widest set in the app. */
const CONTAINER_TABS = ['Logs', 'Stats', 'Env', 'Config', 'Files', 'Patterns'];

describe('panelCountLabel', () => {
  it('renders running/total when running is known', () => {
    expect(panelCountLabel({ total: 3, running: 2 })).toBe(' 2/3');
  });

  it('renders just the total otherwise', () => {
    expect(panelCountLabel({ total: 21 })).toBe(' 21');
  });

  it('renders nothing without a count', () => {
    expect(panelCountLabel(undefined)).toBe('');
  });
});

describe('shouldCompactTabs', () => {
  it('compacts at the default 80-column terminal', () => {
    // This is the regression: at 80 columns the five titles did not fit, and
    // Ink wrapped them into three rows of fragments.
    expect(shouldCompactTabs(PANELS, COUNTS, 'normal', 80)).toBe(true);
  });

  it('compacts at the stated 60-column minimum', () => {
    expect(shouldCompactTabs(PANELS, COUNTS, 'normal', 60)).toBe(true);
  });

  it('keeps titles on a wide terminal', () => {
    expect(shouldCompactTabs(PANELS, COUNTS, 'normal', 120)).toBe(false);
  });

  it('compact tabs are strictly narrower than full ones', () => {
    const full = panelTabWidth(1, 'Containers', COUNTS[0], false);
    const compact = panelTabWidth(1, 'Containers', COUNTS[0], true);
    expect(compact).toBeLessThan(full);
  });

  it('the compact bar actually fits 60 columns', () => {
    const used = PANELS.reduce((sum, p, i) => sum + panelTabWidth(p.shortcutKey, p.title, COUNTS[i], true), 0);
    expect(used).toBeLessThanOrEqual(60);
  });
});

describe('detailTabWindow', () => {
  it('shows every tab and the hint when there is room', () => {
    const win = detailTabWindow(CONTAINER_TABS, 0, 120, DETAIL_TAB_SUFFIX_LENGTH);
    expect(win.start).toBe(0);
    expect(win.count).toBe(CONTAINER_TABS.length);
    expect(win.showSuffix).toBe(true);
    expect(win.hasLeftMarker).toBe(false);
  });

  it('drops the hint before dropping tabs', () => {
    const total = CONTAINER_TABS.reduce((s, l) => s + detailTabWidth(l), 0);
    const win = detailTabWindow(CONTAINER_TABS, 0, total, DETAIL_TAB_SUFFIX_LENGTH);
    expect(win.showSuffix).toBe(false);
    expect(win.count).toBe(CONTAINER_TABS.length);
  });

  it('never renders more than fits', () => {
    const paneWidth = 30;
    const win = detailTabWindow(CONTAINER_TABS, 0, paneWidth, DETAIL_TAB_SUFFIX_LENGTH);
    const used = CONTAINER_TABS
      .slice(win.start, win.start + win.count)
      .reduce((s, l) => s + detailTabWidth(l), 0);
    expect(used).toBeLessThanOrEqual(paneWidth);
  });

  it('keeps the active tab visible when it is off the right edge', () => {
    // Patterns is last and widest; at a narrow width the strip must scroll to it.
    const active = CONTAINER_TABS.length - 1;
    const win = detailTabWindow(CONTAINER_TABS, active, 30, DETAIL_TAB_SUFFIX_LENGTH);
    expect(active).toBeGreaterThanOrEqual(win.start);
    expect(active).toBeLessThan(win.start + win.count);
    expect(win.hasLeftMarker).toBe(true);
  });

  it('keeps the active tab visible across every index at a narrow width', () => {
    for (let active = 0; active < CONTAINER_TABS.length; active++) {
      const win = detailTabWindow(CONTAINER_TABS, active, 26, DETAIL_TAB_SUFFIX_LENGTH);
      expect(active, `active=${active}`).toBeGreaterThanOrEqual(win.start);
      expect(active, `active=${active}`).toBeLessThan(win.start + win.count);
    }
  });

  it('always renders at least one tab, even absurdly narrow', () => {
    const win = detailTabWindow(CONTAINER_TABS, 0, 4, DETAIL_TAB_SUFFIX_LENGTH);
    expect(win.count).toBeGreaterThanOrEqual(1);
  });
});
