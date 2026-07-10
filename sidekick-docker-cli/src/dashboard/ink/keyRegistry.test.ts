import { describe, it, expect, vi } from 'vitest';
import type { Key } from 'ink';
import { GLOBAL_BINDINGS, buildHelpBindings, buildContextHint } from './keyRegistry';
import type { KeyContext } from './keyRegistry';
import type { DashboardUIState } from './dashboardTypes';
import type { SidePanel } from '../panels/types';

function bareKey(overrides: Partial<Key> = {}): Key {
  return {
    upArrow: false, downArrow: false, leftArrow: false, rightArrow: false,
    pageDown: false, pageUp: false, return: false, escape: false,
    ctrl: false, shift: false, tab: false, backspace: false, delete: false, meta: false,
    ...overrides,
  } as Key;
}

function makeState(overrides: Partial<DashboardUIState> = {}): DashboardUIState {
  return {
    activePanelIndex: 0,
    selectedItemIndex: 0,
    detailTabIndex: 0,
    layoutMode: 'normal',
    focusTarget: 'side',
    overlay: null,
    filterString: '',
    detailScrollOffset: 0,
    detailScrollPerTab: {},
    toasts: [],
    contextMenuIndex: 0,
    confirmAction: null,
    confirmMessage: '',
    confirmSeverity: 'high',
    execOutputLines: [],
    execContainerId: null,
    execContainerName: '',
    logFilterString: '',
    logFilterMode: 'exact',
    showAllContainers: true,
    sortField: 'state',
    sortReversed: false,
    sortMenuIndex: 0,
    compareItemIds: {},
    secondaryDetailScrollOffset: 0,
    ...overrides,
  };
}

function makePanel(id: string): SidePanel {
  return {
    id,
    title: id,
    shortcutKey: 1,
    detailTabs: [{ label: 'Logs', render: () => [], autoScrollBottom: true }],
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
      { input: '', key: bareKey({ return: true }), id: 'descend' },
      { input: 'h', id: 'focus-back' },
      { input: '', key: bareKey({ leftArrow: true }), id: 'focus-back' },
      { input: 'l', id: 'focus-detail' },
      { input: '', key: bareKey({ rightArrow: true }), id: 'focus-detail' },
      { input: '', key: bareKey({ pageDown: true }), id: 'page-scroll' },
      { input: '', key: bareKey({ pageUp: true }), id: 'page-scroll' },
      { input: 'd', key: bareKey({ ctrl: true }), id: 'half-page-scroll' },
      { input: 'u', key: bareKey({ ctrl: true }), id: 'half-page-scroll' },
      { input: '', key: bareKey({ escape: true }), id: 'escape' },
    ];
    for (const c of cases) {
      const matched = GLOBAL_BINDINGS.filter(b => b.match(c.input, c.key ?? bareKey()));
      expect(matched.map(m => m.id), `input=${JSON.stringify(c.input)}`).toEqual([c.id]);
    }
  });

  it('does not shadow any panel action key', () => {
    // Full inventory of PanelAction keys across the five panels.
    const panelActionKeys = ['s', 'S', 'r', 'p', 'u', 'd', 'e', 'c', 'P', 'D'];
    for (const k of panelActionKeys) {
      expect(findMatch(k), `panel action key '${k}' must fall through`).toBeUndefined();
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
    expect(side.dispatch).toHaveBeenCalledWith({ type: 'SELECT_ITEM', index: 1 });

    const detail = makeCtx({ state: makeState({ focusTarget: 'detail' }) });
    findMatch('j')!.run(detail, 'j', bareKey());
    expect(detail.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'SCROLL_DETAIL_DELTA', delta: 1 }));
  });

  it('marks containers-only bindings unavailable on other panels', () => {
    const images = makeCtx({ panel: makePanel('images') });
    for (const id of ['log-filter', 'toggle-all', 'sort-menu', 'sort-reverse', 'compare-pin']) {
      const spec = GLOBAL_BINDINGS.find(b => b.id === id)!;
      expect(spec.isAvailable!(images), id).toBe(false);
    }
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
    expect(hint).toContain('f:Filter');
    expect(hint).toContain('a:All');
    expect(hint).toContain('o:↕state');
    expect(hint).toContain('m:Compare');
  });

  it('omits unavailable hints on other panels', () => {
    const hint = buildContextHint(makeCtx({ panel: makePanel('networks') }));
    expect(hint).toBe('');
  });
});
