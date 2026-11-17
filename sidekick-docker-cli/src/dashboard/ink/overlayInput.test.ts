import { describe, it, expect, vi } from 'vitest';
import type { Key } from 'ink';
import { OVERLAY_INPUT_HANDLERS } from './overlayInput';
import type { OverlayInputContext } from './overlayInput';
import type { DashboardUIState } from './dashboardTypes';

function bareKey(overrides: Partial<Key> = {}): Key {
  return {
    upArrow: false, downArrow: false, leftArrow: false, rightArrow: false,
    pageDown: false, pageUp: false, return: false, escape: false,
    ctrl: false, shift: false, tab: false, backspace: false, delete: false, meta: false,
    ...overrides,
  } as Key;
}

function makeCtx(stateOverrides: Partial<DashboardUIState> = {}): OverlayInputContext & { dispatched: unknown[] } {
  const dispatched: unknown[] = [];
  const state: DashboardUIState = {
    activePanelIndex: 0, selectedItemIndex: 0, detailTabIndex: 0,
    layoutMode: 'normal', focusTarget: 'side', overlay: 'filter',
    filterString: '', detailScrollOffset: 0, detailScrollPerTab: {}, toasts: [],
    contextMenuIndex: 0, confirmAction: null, confirmMessage: '', confirmSeverity: 'high',
    execOutputLines: [], execContainerId: null, execContainerName: '',
    logFilterString: '', logFilterMode: 'exact', showAllContainers: true,
    sortField: 'state', sortReversed: false, sortMenuIndex: 0,
    compareItemIds: {}, secondaryDetailScrollOffset: 0, helpScroll: 0,
    ...stateOverrides,
  };
  return {
    state,
    dispatch: (a: unknown) => dispatched.push(a),
    dispatched,
    contextActions: [],
    selectedItem: { id: 'c1', label: 'web', sortKey: 0, data: {} },
    addToast: vi.fn().mockReturnValue(1),
    removeToast: vi.fn(),
    helpMaxScroll: 12,
  };
}

describe('help overlay input', () => {
  it('scrolls with j/k, pages, and jumps to the ends', () => {
    const ctx = makeCtx({ overlay: 'help' });
    OVERLAY_INPUT_HANDLERS.help('j', bareKey(), ctx);
    OVERLAY_INPUT_HANDLERS.help('k', bareKey(), ctx);
    OVERLAY_INPUT_HANDLERS.help('', bareKey({ pageDown: true }), ctx);
    OVERLAY_INPUT_HANDLERS.help('G', bareKey(), ctx);
    expect(ctx.dispatched).toEqual([
      { type: 'HELP_SCROLL', delta: 1, max: 12 },
      { type: 'HELP_SCROLL', delta: -1, max: 12 },
      { type: 'HELP_SCROLL', delta: 10, max: 12 },
      { type: 'HELP_SCROLL', delta: 12, max: 12 },
    ]);
  });

  it('still closes on ? / Esc / q', () => {
    const ctx = makeCtx({ overlay: 'help' });
    OVERLAY_INPUT_HANDLERS.help('?', bareKey(), ctx);
    expect(ctx.dispatched).toEqual([{ type: 'SET_OVERLAY', overlay: null }]);
  });
});

describe('filter overlay input', () => {
  it("types 'q' into the filter instead of closing it (rabbitmq regression)", () => {
    const ctx = makeCtx({ filterString: 'rabbitm' });
    OVERLAY_INPUT_HANDLERS.filter('q', bareKey(), ctx);
    expect(ctx.dispatched).toContainEqual({ type: 'SET_FILTER', value: 'rabbitmq' });
    expect(ctx.dispatched).not.toContainEqual({ type: 'SET_OVERLAY', overlay: null });
  });

  it('Escape clears the filter and closes the overlay', () => {
    const ctx = makeCtx({ filterString: 'web' });
    OVERLAY_INPUT_HANDLERS.filter('', bareKey({ escape: true }), ctx);
    expect(ctx.dispatched).toContainEqual({ type: 'SET_FILTER', value: '' });
    expect(ctx.dispatched).toContainEqual({ type: 'SET_OVERLAY', overlay: null });
  });

  it('Enter applies (closes overlay, keeps value)', () => {
    const ctx = makeCtx({ filterString: 'web' });
    OVERLAY_INPUT_HANDLERS.filter('', bareKey({ return: true }), ctx);
    expect(ctx.dispatched).toEqual([{ type: 'SET_OVERLAY', overlay: null }]);
  });

  it('Backspace deletes the last character', () => {
    const ctx = makeCtx({ filterString: 'web' });
    OVERLAY_INPUT_HANDLERS.filter('', bareKey({ backspace: true }), ctx);
    expect(ctx.dispatched).toContainEqual({ type: 'SET_FILTER', value: 'we' });
  });
});

describe('log-filter overlay input', () => {
  it("accepts 'q' as a character and Tab toggles the mode", () => {
    const ctx = makeCtx({ overlay: 'log-filter', logFilterString: 'sq' });
    OVERLAY_INPUT_HANDLERS['log-filter']('q', bareKey(), ctx);
    expect(ctx.dispatched).toContainEqual({ type: 'SET_LOG_FILTER', value: 'sqq' });

    const tabCtx = makeCtx({ overlay: 'log-filter' });
    OVERLAY_INPUT_HANDLERS['log-filter']('', bareKey({ tab: true }), tabCtx);
    expect(tabCtx.dispatched).toContainEqual({ type: 'TOGGLE_LOG_FILTER_MODE' });
  });
});

describe('confirm overlay input', () => {
  it('y runs the confirmed action and closes', () => {
    const action = vi.fn();
    const ctx = makeCtx({ overlay: 'confirm', confirmAction: action });
    OVERLAY_INPUT_HANDLERS.confirm('y', bareKey(), ctx);
    expect(action).toHaveBeenCalled();
    expect(ctx.dispatched).toContainEqual({ type: 'SET_CONFIRM', action: null, message: '' });
  });

  it('Enter cancels (safe default) without running the action', () => {
    const action = vi.fn();
    const ctx = makeCtx({ overlay: 'confirm', confirmAction: action });
    OVERLAY_INPUT_HANDLERS.confirm('', bareKey({ return: true }), ctx);
    expect(action).not.toHaveBeenCalled();
    expect(ctx.dispatched).toContainEqual({ type: 'SET_CONFIRM', action: null, message: '' });
  });

  it('n, Esc, and q all cancel', () => {
    for (const [input, key] of [['n', bareKey()], ['q', bareKey()], ['', bareKey({ escape: true })]] as const) {
      const action = vi.fn();
      const ctx = makeCtx({ overlay: 'confirm', confirmAction: action });
      OVERLAY_INPUT_HANDLERS.confirm(input, key, ctx);
      expect(action).not.toHaveBeenCalled();
      expect(ctx.dispatched).toContainEqual({ type: 'SET_CONFIRM', action: null, message: '' });
    }
  });
});

describe('context menu overlay input', () => {
  it('Enter executes the highlighted action and closes', () => {
    const handler = vi.fn();
    const ctx = makeCtx({ overlay: 'context-menu', contextMenuIndex: 0 });
    ctx.contextActions = [{ key: 's', label: 'Start', handler }];
    OVERLAY_INPUT_HANDLERS['context-menu']('', bareKey({ return: true }), ctx);
    expect(handler).toHaveBeenCalled();
    expect(ctx.dispatched).toContainEqual({ type: 'SET_OVERLAY', overlay: null });
  });

  it('j/k navigate the menu', () => {
    const ctx = makeCtx({ overlay: 'context-menu' });
    ctx.contextActions = [
      { key: 's', label: 'Start', handler: vi.fn() },
      { key: 'd', label: 'Remove', handler: vi.fn() },
    ];
    OVERLAY_INPUT_HANDLERS['context-menu']('j', bareKey(), ctx);
    expect(ctx.dispatched).toContainEqual({ type: 'CONTEXT_MENU_NAV', delta: 1, itemCount: 2 });
  });

  // Regression: the menu-close dispatch used to come AFTER executeAction, so
  // the reducer applied SET_CONFIRM (overlay='confirm') then SET_OVERLAY:null —
  // the confirm modal never appeared and destructive actions silently no-oped.
  it('confirm-requiring actions open the confirm modal after the menu closes (Enter)', () => {
    const ctx = makeCtx({ overlay: 'context-menu', contextMenuIndex: 0 });
    ctx.contextActions = [{ key: 'd', label: 'Remove', handler: vi.fn(), confirm: true, confirmMessage: 'Remove "web"?' }];
    OVERLAY_INPUT_HANDLERS['context-menu']('', bareKey({ return: true }), ctx);

    const types = ctx.dispatched.map(a => (a as { type: string }).type);
    const closeIdx = types.indexOf('SET_OVERLAY');
    const confirmIdx = types.indexOf('SET_CONFIRM');
    expect(closeIdx).toBeGreaterThanOrEqual(0);
    expect(confirmIdx).toBeGreaterThan(closeIdx);
    const confirm = ctx.dispatched[confirmIdx] as { action: unknown; message: string };
    expect(confirm.message).toBe('Remove "web"?');
    expect(typeof confirm.action).toBe('function');
  });

  it('confirm-requiring actions open the confirm modal after the menu closes (shortcut key)', () => {
    const ctx = makeCtx({ overlay: 'context-menu' });
    ctx.contextActions = [{ key: 'd', label: 'Remove', handler: vi.fn(), confirm: true, confirmMessage: 'Remove "web"?' }];
    OVERLAY_INPUT_HANDLERS['context-menu']('d', bareKey(), ctx);

    const types = ctx.dispatched.map(a => (a as { type: string }).type);
    expect(types.indexOf('SET_CONFIRM')).toBeGreaterThan(types.indexOf('SET_OVERLAY'));
  });
});

describe('sort overlay input', () => {
  it('Enter applies the highlighted field', () => {
    const ctx = makeCtx({ overlay: 'sort', sortMenuIndex: 2 });
    OVERLAY_INPUT_HANDLERS.sort('', bareKey({ return: true }), ctx);
    expect(ctx.dispatched).toContainEqual({ type: 'SET_SORT_FIELD', field: 'cpu' });
    // The menu's label, not the raw field id.
    expect(ctx.addToast).toHaveBeenCalledWith('Sort: CPU %', 'info');
  });

  it('R names the new direction in words that fit the field (T17)', () => {
    // Stats fields default to highest first, so reversing gives lowest first —
    // the toast used to say "descending".
    const ctx = makeCtx({ overlay: 'sort', sortField: 'cpu', sortReversed: false });
    OVERLAY_INPUT_HANDLERS.sort('R', bareKey(), ctx);
    expect(ctx.dispatched).toContainEqual({ type: 'TOGGLE_SORT_REVERSE' });
    expect(ctx.addToast).toHaveBeenCalledWith('Sort: CPU %, lowest first', 'info');
    const name = makeCtx({ overlay: 'sort', sortField: 'name', sortReversed: true });
    OVERLAY_INPUT_HANDLERS.sort('R', bareKey(), name);
    expect(name.addToast).toHaveBeenCalledWith('Sort: Name, A→Z', 'info');
  });

  it('q and Esc close it', () => {
    for (const [input, key] of [['q', bareKey()], ['', bareKey({ escape: true })]] as const) {
      const ctx = makeCtx({ overlay: 'sort' });
      OVERLAY_INPUT_HANDLERS.sort(input, key, ctx);
      expect(ctx.dispatched).toContainEqual({ type: 'SET_OVERLAY', overlay: null });
    }
  });
});

describe('help/version overlays', () => {
  it('close on their toggle key, q, and Esc', () => {
    for (const [name, toggle] of [['help', '?'], ['version', 'V']] as const) {
      for (const [input, key] of [[toggle, bareKey()], ['q', bareKey()], ['', bareKey({ escape: true })]] as const) {
        const ctx = makeCtx({ overlay: name });
        OVERLAY_INPUT_HANDLERS[name](input, key, ctx);
        expect(ctx.dispatched, `${name} via ${input || 'Esc'}`).toContainEqual({ type: 'SET_OVERLAY', overlay: null });
      }
    }
  });
});

describe('chords never answer or run (T2)', () => {
  it('Ctrl+Y / Alt+Y do not confirm', () => {
    for (const key of [bareKey({ ctrl: true }), bareKey({ meta: true })]) {
      const action = vi.fn();
      const ctx = makeCtx({ overlay: 'confirm', confirmAction: action });
      OVERLAY_INPUT_HANDLERS.confirm('y', key, ctx);
      expect(action).not.toHaveBeenCalled();
      expect(ctx.dispatched).toEqual([]);
    }
  });

  it('Ctrl+R in the actions menu does not run Restart', () => {
    const handler = vi.fn();
    const ctx = makeCtx({ overlay: 'context-menu' });
    ctx.contextActions = [{ key: 'r', label: 'Restart', handler }];
    OVERLAY_INPUT_HANDLERS['context-menu']('r', bareKey({ ctrl: true }), ctx);
    expect(handler).not.toHaveBeenCalled();
    expect(ctx.dispatched).toEqual([]);
  });
});

describe('runs of j/k in menus (T22)', () => {
  it('move the actions menu, sort menu and help by the run length', () => {
    const menu = makeCtx({ overlay: 'context-menu' });
    menu.contextActions = [
      { key: 's', label: 'Start', handler: vi.fn() },
      { key: 'd', label: 'Remove', handler: vi.fn() },
      { key: 'e', label: 'Exec', handler: vi.fn() },
    ];
    OVERLAY_INPUT_HANDLERS['context-menu']('jj', bareKey(), menu);
    expect(menu.dispatched).toEqual([{ type: 'CONTEXT_MENU_NAV', delta: 2, itemCount: 3 }]);

    const sort = makeCtx({ overlay: 'sort' });
    OVERLAY_INPUT_HANDLERS.sort('kkk', bareKey(), sort);
    expect(sort.dispatched).toEqual([{ type: 'SORT_MENU_NAV', delta: -3 }]);

    const help = makeCtx({ overlay: 'help' });
    OVERLAY_INPUT_HANDLERS.help('jjjj', bareKey(), help);
    expect(help.dispatched).toEqual([{ type: 'HELP_SCROLL', delta: 4, max: 12 }]);
  });

  it('a mixed chunk does nothing in the actions menu', () => {
    const handler = vi.fn();
    const menu = makeCtx({ overlay: 'context-menu' });
    menu.contextActions = [{ key: 'd', label: 'Remove', handler, confirm: true }];
    OVERLAY_INPUT_HANDLERS['context-menu']('jd', bareKey(), menu);
    expect(menu.dispatched).toEqual([]);
  });
});

describe('help Home/End (T25)', () => {
  it('jump to the ends', () => {
    const ctx = makeCtx({ overlay: 'help' });
    OVERLAY_INPUT_HANDLERS.help('', bareKey({ end: true }), ctx);
    OVERLAY_INPUT_HANDLERS.help('', bareKey({ home: true }), ctx);
    expect(ctx.dispatched).toEqual([
      { type: 'HELP_SCROLL', delta: 12, max: 12 },
      { type: 'HELP_SCROLL', delta: -12, max: 12 },
    ]);
  });
});

describe('filter prompts drop control characters (T24)', () => {
  it('strips a pasted newline, tab or BEL from the text', () => {
    const ctx = makeCtx({ filterString: 'we' });
    OVERLAY_INPUT_HANDLERS.filter('b\n\x07', bareKey(), ctx);
    expect(ctx.dispatched).toEqual([{ type: 'SET_FILTER', value: 'web' }]);
  });

  it('a chunk of only control characters types nothing', () => {
    const ctx = makeCtx({ filterString: 'web' });
    OVERLAY_INPUT_HANDLERS.filter('\x07', bareKey(), ctx);
    expect(ctx.dispatched).toEqual([]);
  });

  it('pasted tabs toggle the log filter mode once each, and type nothing in the panel filter', () => {
    const log = makeCtx({ overlay: 'log-filter', logFilterString: 'err' });
    OVERLAY_INPUT_HANDLERS['log-filter']('\t\t\t', bareKey(), log);
    expect(log.dispatched).toEqual([
      { type: 'TOGGLE_LOG_FILTER_MODE' },
      { type: 'TOGGLE_LOG_FILTER_MODE' },
      { type: 'TOGGLE_LOG_FILTER_MODE' },
    ]);
    const panel = makeCtx({ filterString: 'web' });
    OVERLAY_INPUT_HANDLERS.filter('\t', bareKey(), panel);
    expect(panel.dispatched).toEqual([]);
  });

  it('Esc still clears the log filter', () => {
    const ctx = makeCtx({ overlay: 'log-filter', logFilterString: 'err' });
    OVERLAY_INPUT_HANDLERS['log-filter']('', bareKey({ escape: true }), ctx);
    expect(ctx.dispatched).toContainEqual({ type: 'SET_LOG_FILTER', value: '' });
  });
});
