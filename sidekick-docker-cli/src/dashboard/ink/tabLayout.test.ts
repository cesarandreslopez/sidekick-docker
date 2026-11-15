import { describe, it, expect } from 'vitest';
import {
  panelCountLabel,
  panelTabWidth,
  shouldCompactTabs,
  detailTabWidth,
  detailTabWindow,
  DETAIL_TAB_SUFFIX_LENGTH,
  detailTabSuffix,
  DETAIL_TAB_CYCLE_HINT,
  DETAIL_TAB_FOLLOW_PAUSED,
  DETAIL_TAB_NAME_MIN,
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
/** The real Containers detail tabs, in order (see ContainersPanel.ts). */
const CONTAINER_TABS = ['Logs', 'Stats', 'Env', 'Config', 'Labels', 'Files', 'Patterns'];

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

  it('never renders wider than the pane, markers included', () => {
    // The '‹' and '›' markers DetailTabBar draws are part of the row. Leaving
    // them out of the budget made the strip render paneWidth + 1 and wrap onto
    // a second row — which also shifts every row useMouseHandler counts on.
    for (let paneWidth = 12; paneWidth <= 120; paneWidth++) {
      for (let active = 0; active < CONTAINER_TABS.length; active++) {
        const win = detailTabWindow(CONTAINER_TABS, active, paneWidth, DETAIL_TAB_SUFFIX_LENGTH);
        const tabs = CONTAINER_TABS
          .slice(win.start, win.start + win.count)
          .reduce((sum, l) => sum + detailTabWidth(l), 0);
        const markers =
          (win.hasLeftMarker ? 1 : 0) +
          (win.start + win.count < CONTAINER_TABS.length ? 1 : 0);
        const suffix = win.showSuffix ? DETAIL_TAB_SUFFIX_LENGTH : 0;

        // The one unavoidable exception: a pane too narrow for even a single
        // tab still renders one, because showing nothing is worse.
        if (win.count === 1 && tabs + markers > paneWidth) continue;

        expect(
          tabs + markers + suffix,
          `paneWidth=${paneWidth} active=${active} start=${win.start} count=${win.count}`,
        ).toBeLessThanOrEqual(paneWidth);
      }
    }
  });

  it('reserves a column for the left marker once the window has scrolled', () => {
    // hasLeftMarker implies a '‹' is drawn, so the tabs must fit in one column
    // less than the budget they would otherwise have had.
    const paneWidth = 34;
    const win = detailTabWindow(CONTAINER_TABS, CONTAINER_TABS.length - 1, paneWidth, DETAIL_TAB_SUFFIX_LENGTH);
    expect(win.hasLeftMarker).toBe(true);
    const tabs = CONTAINER_TABS
      .slice(win.start, win.start + win.count)
      .reduce((sum, l) => sum + detailTabWidth(l), 0);
    expect(tabs + 1).toBeLessThanOrEqual(paneWidth);
  });
});

describe('detailTabSuffix (T15)', () => {
  const tabs = ['Logs', 'Stats', 'Env', 'Config', 'Labels', 'Files', 'Patterns'];
  const tabsWidth = tabs.reduce((n, l) => n + detailTabWidth(l), 0);

  it('names the item in Expanded, else reports a paused follow, else the cycle hint', () => {
    expect(detailTabSuffix({ followPaused: true, itemName: 'web', paneWidth: 120, tabLabels: tabs })).toEqual({ text: 'web', kind: 'name', reserved: true });
    expect(detailTabSuffix({ followPaused: true, paneWidth: 120, tabLabels: tabs })).toEqual({ text: DETAIL_TAB_FOLLOW_PAUSED, kind: 'paused', reserved: false });
    expect(detailTabSuffix({ followPaused: false, paneWidth: 120, tabLabels: tabs })).toEqual({ text: DETAIL_TAB_CYCLE_HINT, kind: 'hint', reserved: false });
  });

  it('caps a long name at 40 when there is room, keeping its distinguishing end', () => {
    const s = detailTabSuffix({ followPaused: false, itemName: 'an-extremely-long-compose-project-service-name-7', paneWidth: 200, tabLabels: tabs });
    expect(s.text.length).toBe(40);
    expect(s.text.endsWith('-7')).toBe(true);
  });

  it('fits a 30-character name beside the Containers tabs at 80 columns instead of dropping it', () => {
    expect(tabsWidth).toBe(58);
    const name = 'shop-production-api-gateway-12';
    expect(name).toHaveLength(30);
    const s = detailTabSuffix({ followPaused: false, itemName: name, paneWidth: 80, tabLabels: tabs });
    expect(s.text).toHaveLength(80 - 58 - 1);
    expect(s.text.endsWith('-12')).toBe(true);
    // The window agrees: every tab and the name are drawn.
    const win = detailTabWindow(tabs, 0, 80, s.text.length, s.reserved);
    expect(win).toMatchObject({ start: 0, count: tabs.length, showSuffix: true });
  });

  it('below the floor keeps a short name and windows the tabs around it', () => {
    const s = detailTabSuffix({ followPaused: false, itemName: 'shop-production-api-gateway-12', paneWidth: 62, tabLabels: tabs });
    expect(s.text).toHaveLength(DETAIL_TAB_NAME_MIN);
    const win = detailTabWindow(tabs, 6, 62, s.text.length, s.reserved);
    expect(win.showSuffix).toBe(true);
    expect(win.count).toBeLessThan(tabs.length);
    expect(win.start + win.count).toBe(tabs.length); // the active (last) tab stays visible
    // Drawn width: markers + windowed tabs + 1 + name fits the pane.
    const drawn = (win.hasLeftMarker ? 1 : 0) + tabs.slice(win.start, win.start + win.count).reduce((n, l) => n + detailTabWidth(l), 0) + 1 + s.text.length;
    expect(drawn).toBeLessThanOrEqual(62);
  });
});
