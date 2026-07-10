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
    compareItemIds: {}, secondaryDetailScrollOffset: 0,
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
  };
}

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
