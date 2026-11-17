import { describe, it, expect, vi } from 'vitest';
import type { Key } from 'ink';
import { GLOBAL_BINDINGS, buildHelpBindings, buildContextHint, findGlobalBinding, navigateBy } from './keyRegistry';
import type { KeyContext } from './keyRegistry';
import type { DashboardUIState } from './dashboardTypes';
import type { SidePanel } from '../panels/types';
import { initialState } from './Dashboard';

function bareKey(overrides: Partial<Key> = {}): Key {
  return {
    upArrow: false, downArrow: false, leftArrow: false, rightArrow: false,
    pageDown: false, pageUp: false, return: false, escape: false,
    ctrl: false, shift: false, tab: false, backspace: false, delete: false, meta: false,
    ...overrides,
  } as Key;
}

function makeState(overrides: Partial<DashboardUIState> = {}): DashboardUIState {
  return { ...initialState, ...overrides };
}

function makePanel(id: string): SidePanel {
  // Only containers/services have a tailing logs tab, mirroring the real panels.
  const hasLogsTab = id === 'containers' || id === 'services';
  return {
    id,
    title: id,
    shortcutKey: 1,
    detailTabs: hasLogsTab
      ? [{ label: 'Logs', render: () => [], autoScrollBottom: true }]
      : [{ label: 'Info', render: () => [] }],
    getItems: () => [],
    getActions: () => [],
  };
}

function makeCtx(overrides: Partial<KeyContext> = {}): KeyContext {
  const panel = makePanel('containers');
  return {
    state: makeState(),
    dispatch: vi.fn(),
    panels: [panel, makePanel('services'), makePanel('images'), makePanel('volumes'), makePanel('networks')],
    panel,
    selectedItem: { id: 'c1', label: 'web', sortKey: 0, data: {} },
    applicableActions: [{ key: 's', label: 'Start', handler: () => {} }],
    clampedSelection: 0,
    currentItems: [{ id: 'c1', label: 'web', sortKey: 0, data: {} }],
    detailLines: ['a', 'b'],
    detailViewportHeight: 10,
    detailTabs: panel.detailTabs,
    tabIdx: 0,
    sideScroll: { selectNext: vi.fn(), selectPrev: vi.fn(), selectFirst: vi.fn(), selectLast: vi.fn(), setSelected: vi.fn() },
    addToast: vi.fn().mockReturnValue(1),
    exit: vi.fn(),
    refresh: vi.fn(),
    helpMaxScroll: 0,
    tooSmall: false,
    secondaryDetailLineCount: 0,
    ...overrides,
  };
}

function findMatch(input: string, key: Key = bareKey()) {
  return GLOBAL_BINDINGS.find(b => b.match(input, key));
}

describe('GLOBAL_BINDINGS dispatch table', () => {
  it('maps every previously-bound key to exactly one spec', () => {
    const cases: Array<{ input: string; key?: Key; id: string }> = [
      { input: 'q', id: 'quit' },
      { input: '?', id: 'help' },
      { input: 'V', id: 'version' },
      { input: '1', id: 'panel-switch' },
      { input: '5', id: 'panel-switch' },
      { input: '', key: bareKey({ tab: true }), id: 'focus-toggle' },
      { input: 'z', id: 'layout-cycle' },
      { input: '/', id: 'filter' },
      { input: 'f', id: 'log-filter' },
      { input: 'a', id: 'toggle-all' },
      { input: 'o', id: 'sort-menu' },
      { input: 'R', id: 'sort-reverse' },
      { input: 'm', id: 'compare-pin' },
      { input: 'M', id: 'mouse-toggle' },
      { input: 'w', id: 'wrap-toggle' },
      { input: 'x', id: 'actions-menu' },
      { input: '[', id: 'detail-tab-cycle' },
      { input: ']', id: 'detail-tab-cycle' },
      { input: 'J', id: 'secondary-scroll' },
      { input: 'K', id: 'secondary-scroll' },
      { input: 'j', id: 'nav' },
      { input: 'k', id: 'nav' },
      { input: '', key: bareKey({ downArrow: true }), id: 'nav' },
      { input: 'g', id: 'jump-edges' },
      { input: 'G', id: 'jump-edges' },
      { input: '', key: bareKey({ home: true }), id: 'jump-edges' },
      { input: '', key: bareKey({ end: true }), id: 'jump-edges' },
      { input: '', key: bareKey({ return: true }), id: 'descend' },
      { input: 'h', id: 'focus-back' },
      { input: '', key: bareKey({ leftArrow: true }), id: 'focus-back' },
      { input: 'l', id: 'focus-detail' },
      { input: '', key: bareKey({ rightArrow: true }), id: 'focus-detail' },
      { input: '', key: bareKey({ pageDown: true }), id: 'page-scroll' },
      { input: '', key: bareKey({ pageUp: true }), id: 'page-scroll' },
      { input: 'd', key: bareKey({ ctrl: true }), id: 'half-page-scroll' },
      { input: 'r', key: bareKey({ ctrl: true }), id: 'refresh' },
      { input: 'u', key: bareKey({ ctrl: true }), id: 'half-page-scroll' },
      { input: '', key: bareKey({ escape: true }), id: 'escape' },
    ];
    for (const c of cases) {
      const matched = GLOBAL_BINDINGS.filter(b => b.match(c.input, c.key ?? bareKey()));
      expect(matched.map(m => m.id), `input=${JSON.stringify(c.input)}`).toEqual([c.id]);
    }
  });

  it('panel switch respects panels.length', () => {
    const ctx = makeCtx();
    const spec = findMatch('7')!;
    spec.run(ctx, '7', bareKey());
    expect(ctx.dispatch).not.toHaveBeenCalled();
    spec.run(ctx, '2', bareKey());
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'SWITCH_PANEL', index: 1 });
  });

  it('nav scrolls detail when detail is focused and selects when side is focused', () => {
    const items = [
      { id: 'c1', label: 'web', sortKey: 0, data: {} },
      { id: 'c2', label: 'db', sortKey: 1, data: {} },
    ];
    const side = makeCtx({ currentItems: items });
    findMatch('j')!.run(side, 'j', bareKey());
    // The id rides along so a later reorder keeps this item selected.
    expect(side.dispatch).toHaveBeenCalledWith({ type: 'SELECT_ITEM', index: 1, id: 'c2' });

    const detail = makeCtx({ state: makeState({ focusTarget: 'detail' }) });
    findMatch('j')!.run(detail, 'j', bareKey());
    expect(detail.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'SCROLL_DETAIL_DELTA', delta: 1 }));
  });

  it('G resumes a paused follow even with the list focused; a second G selects the last item', () => {
    const items = [
      { id: 'c1', label: 'web', sortKey: 0, data: {} },
      { id: 'c2', label: 'db', sortKey: 1, data: {} },
    ];
    const paused = makeCtx({ currentItems: items, state: makeState({ focusTarget: 'side', logFollow: false }) });
    findMatch('G')!.run(paused, 'G', bareKey());
    expect(paused.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'SCROLL_DETAIL', followTab: true }));
    expect(paused.dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'SELECT_ITEM' }));

    const following = makeCtx({ currentItems: items, state: makeState({ focusTarget: 'side', logFollow: true }) });
    findMatch('G')!.run(following, 'G', bareKey());
    expect(following.dispatch).toHaveBeenCalledWith({ type: 'SELECT_ITEM', index: 1, id: 'c2' });
  });

  it('G also resumes a compare pane paused by K, and is not taken as "select last"', () => {
    const items = [
      { id: 'c1', label: 'web', sortKey: 0, data: {} },
      { id: 'c2', label: 'db', sortKey: 1, data: {} },
    ];
    const ctx = makeCtx({ currentItems: items, secondaryDetailLineCount: 40, state: makeState({ focusTarget: 'side', logFollow: true, secondaryFollow: false }) });
    findMatch('G')!.run(ctx, 'G', bareKey());
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'RESUME_SECONDARY_FOLLOW' });
    expect(ctx.dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'SELECT_ITEM' }));

    // Nothing paused: no resume dispatch, G selects the last item.
    const following = makeCtx({ currentItems: items, secondaryDetailLineCount: 40, state: makeState({ focusTarget: 'side' }) });
    findMatch('G')!.run(following, 'G', bareKey());
    expect(following.dispatch).not.toHaveBeenCalledWith({ type: 'RESUME_SECONDARY_FOLLOW' });
    expect(following.dispatch).toHaveBeenCalledWith({ type: 'SELECT_ITEM', index: 1, id: 'c2' });
  });

  it('g with the list focused still selects the first item while follow is paused', () => {
    const ctx = makeCtx({ state: makeState({ focusTarget: 'side', logFollow: false }) });
    findMatch('g')!.run(ctx, 'g', bareKey());
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'SELECT_ITEM', index: 0, id: 'c1' });
  });

  it('Tab is unavailable in Expanded, where the list is hidden (T15)', () => {
    const spec = GLOBAL_BINDINGS.find(b => b.id === 'focus-toggle')!;
    expect(spec.isAvailable!(makeCtx({ state: makeState({ layoutMode: 'expanded' }) }))).toBe(false);
    expect(spec.isAvailable!(makeCtx())).toBe(true);
  });

  it('M toggles mouse capture and says what that means', () => {
    const on = makeCtx();
    findMatch('M')!.run(on, 'M', bareKey());
    expect(on.dispatch).toHaveBeenCalledWith({ type: 'TOGGLE_MOUSE' });
    expect(on.addToast).toHaveBeenCalledWith(expect.stringContaining('select text'), 'info');
    const off = makeCtx({ state: makeState({ mouseEnabled: false }) });
    findMatch('M')!.run(off, 'M', bareKey());
    expect(off.addToast).toHaveBeenCalledWith('Mouse on', 'info');
  });

  it('names sort fields by their menu label in the R toast', () => {
    const ctx = makeCtx({ state: makeState({ sortField: 'mem' }) });
    findMatch('R')!.run(ctx, 'R', bareKey());
    expect(ctx.addToast).toHaveBeenCalledWith('Sort: Memory %, lowest first', 'info');
  });

  it('pin toast uses the plain name, not the label decorations', () => {
    const item = { id: 'c1', label: '● web :8080', name: 'web', sortKey: 0, data: {}, badge: 'healthy' };
    const ctx = makeCtx({ selectedItem: item, currentItems: [item] });
    findMatch('m')!.run(ctx, 'm', bareKey());
    expect(ctx.addToast).toHaveBeenCalledWith(expect.stringMatching(/^Pinned web for comparison/), 'info');
  });

  it('marks containers-only bindings unavailable on other panels', () => {
    const imagesPanel = makePanel('images');
    const images = makeCtx({ panel: imagesPanel, detailTabs: imagesPanel.detailTabs });
    for (const id of ['log-filter', 'toggle-all', 'sort-menu', 'sort-reverse', 'compare-pin']) {
      const spec = GLOBAL_BINDINGS.find(b => b.id === id)!;
      expect(spec.isAvailable!(images), id).toBe(false);
    }
  });

  it('log filter is available on any tailing logs tab (Services too)', () => {
    const services = makePanel('services');
    const ctx = makeCtx({ panel: services, detailTabs: services.detailTabs, tabIdx: 0 });
    const spec = GLOBAL_BINDINGS.find(b => b.id === 'log-filter')!;
    expect(spec.isAvailable!(ctx)).toBe(true);
  });

  it('actions-menu is unavailable when no applicable actions exist', () => {
    const spec = GLOBAL_BINDINGS.find(b => b.id === 'actions-menu')!;
    expect(spec.isAvailable!(makeCtx({ applicableActions: [] }))).toBe(false);
    expect(spec.isAvailable!(makeCtx())).toBe(true);
  });
});

describe('buildHelpBindings', () => {
  it('produces an entry per binding with availability for the current panel', () => {
    const bindings = buildHelpBindings(makeCtx({ panel: makePanel('volumes') }));
    expect(bindings.length).toBe(GLOBAL_BINDINGS.length);
    const byId = Object.fromEntries(GLOBAL_BINDINGS.map((b, i) => [b.id, bindings[i]]));
    expect(byId['toggle-all'].available).toBe(false);
    expect(byId['nav'].available).toBe(true);
  });
});

describe('buildContextHint', () => {
  it('includes containers hints on the containers logs tab', () => {
    const hint = buildContextHint(makeCtx());
    expect(hint).toContain('f:Log filter');
    // What a does next, and the sort field by its menu label (T31).
    expect(hint).toContain('a:Show running');
    expect(hint).toContain('o:↕State');
    expect(hint).toContain('m:Compare');
    const runningOnly = buildContextHint(makeCtx({ state: makeState({ showAllContainers: false, sortField: 'mem' }) }));
    expect(runningOnly).toContain('a:Show all');
    expect(runningOnly).toContain('o:↕Memory %');
  });

  it('omits unavailable hints on other panels', () => {
    const networks = makePanel('networks');
    const hint = buildContextHint(makeCtx({ panel: networks, detailTabs: networks.detailTabs }));
    expect(hint).toBe('');
  });

  it('Ctrl+R refreshes while a bare r still reaches the Restart action', () => {
    const ctx = makeCtx();
    const spec = GLOBAL_BINDINGS.find(b => b.match('r', bareKey({ ctrl: true })));
    spec?.run(ctx, 'r', bareKey({ ctrl: true }));
    expect(ctx.refresh).toHaveBeenCalledTimes(1);
    expect(GLOBAL_BINDINGS.some(b => b.match('r', bareKey()))).toBe(false);
  });
});

describe('findGlobalBinding (T28)', () => {
  it('skips bare-letter bindings while Ctrl or Meta is held', () => {
    expect(findGlobalBinding('q', bareKey({ ctrl: true }))).toBeUndefined();
    expect(findGlobalBinding('x', bareKey({ meta: true }))).toBeUndefined();
    expect(findGlobalBinding('g', bareKey({ ctrl: true }))).toBeUndefined();
    expect(findGlobalBinding('', bareKey({ meta: true, upArrow: true }))).toBeUndefined();
  });

  it('still finds the chords themselves', () => {
    expect(findGlobalBinding('r', bareKey({ ctrl: true }))?.id).toBe('refresh');
    expect(findGlobalBinding('d', bareKey({ ctrl: true }))?.id).toBe('half-page-scroll');
    expect(findGlobalBinding('c', bareKey({ ctrl: true }))?.id).toBe('quit-ctrl-c');
  });

  it('treats two quick Escs (delivered with meta set) as Esc', () => {
    expect(findGlobalBinding('', bareKey({ escape: true, meta: true }))?.id).toBe('escape');
  });

  it('matches bare keys as before', () => {
    expect(findGlobalBinding('q', bareKey())?.id).toBe('quit');
    expect(findGlobalBinding('', bareKey({ tab: true }))?.id).toBe('focus-toggle');
  });

  it('only chord bindings are flagged as chords', () => {
    const chords = GLOBAL_BINDINGS.filter(b => b.chord).map(b => b.id).sort();
    expect(chords).toEqual(['half-page-scroll', 'quit-ctrl-c', 'refresh']);
  });
});

describe('Home/End (T25)', () => {
  it('Home selects the first item and End the last with the list focused', () => {
    const items = [
      { id: 'c1', label: 'web', sortKey: 0, data: {} },
      { id: 'c2', label: 'db', sortKey: 1, data: {} },
    ];
    const home = makeCtx({ currentItems: items, clampedSelection: 1 });
    findGlobalBinding('', bareKey({ home: true }))!.run(home, '', bareKey({ home: true }));
    expect(home.dispatch).toHaveBeenCalledWith({ type: 'SELECT_ITEM', index: 0, id: 'c1' });
    const end = makeCtx({ currentItems: items });
    findGlobalBinding('', bareKey({ end: true }))!.run(end, '', bareKey({ end: true }));
    expect(end.dispatch).toHaveBeenCalledWith({ type: 'SELECT_ITEM', index: 1, id: 'c2' });
  });

  it('Home scrolls the detail pane to the top when it has focus', () => {
    const ctx = makeCtx({ state: makeState({ focusTarget: 'detail' }) });
    findGlobalBinding('', bareKey({ home: true }))!.run(ctx, '', bareKey({ home: true }));
    expect(ctx.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'SCROLL_DETAIL', offset: 0 }));
  });
});

describe('navigateBy (T22)', () => {
  it('moves the list selection by a delta the reducer applies to its own state', () => {
    const items = [
      { id: 'c1', label: 'web', sortKey: 0, data: {} },
      { id: 'c2', label: 'db', sortKey: 1, data: {} },
    ];
    const ctx = makeCtx({ currentItems: items });
    navigateBy(ctx, 4);
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'SCROLL_SIDE', delta: 4, itemCount: 2 });
  });

  it('scrolls the detail pane when it has focus', () => {
    const ctx = makeCtx({ state: makeState({ focusTarget: 'detail' }) });
    navigateBy(ctx, -3);
    expect(ctx.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'SCROLL_DETAIL_DELTA', delta: -3, followTab: true }));
  });

  it('does nothing on an empty list', () => {
    const ctx = makeCtx({ currentItems: [] });
    navigateBy(ctx, 2);
    expect(ctx.dispatch).not.toHaveBeenCalled();
  });
});

describe('wrap toggle (T11)', () => {
  it('w toggles wrap and says which way', () => {
    const off = makeCtx();
    findMatch('w')!.run(off, 'w', bareKey());
    expect(off.dispatch).toHaveBeenCalledWith({ type: 'TOGGLE_WRAP' });
    expect(off.addToast).toHaveBeenCalledWith('Wrap: on', 'info');
    const on = makeCtx({ state: makeState({ wrapLines: true }) });
    findMatch('w')!.run(on, 'w', bareKey());
    expect(on.addToast).toHaveBeenCalledWith('Wrap: off', 'info');
  });

  it('is unavailable while comparing, and hinted on log tabs', () => {
    const spec = GLOBAL_BINDINGS.find(b => b.id === 'wrap-toggle')!;
    expect(spec.isAvailable!(makeCtx({ secondaryDetailLineCount: 12 }))).toBe(false);
    expect(spec.isAvailable!(makeCtx())).toBe(true);
    expect(buildContextHint(makeCtx())).toContain('w:Wrap');
    expect(buildContextHint(makeCtx({ state: makeState({ wrapLines: true }) }))).toContain('w:Unwrap');
  });
});
