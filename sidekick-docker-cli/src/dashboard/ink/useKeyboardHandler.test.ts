import { describe, expect, it, vi } from 'vitest';
import type { Key } from 'ink';
import { handleKeyInput } from './useKeyboardHandler';
import type { KeyContext } from './keyRegistry';
import type { DashboardUIState } from './dashboardTypes';
import type { PanelAction, SidePanel } from '../panels/types';
import { initialState } from './Dashboard';

function bareKey(overrides: Partial<Key> = {}): Key {
  return {
    upArrow: false, downArrow: false, leftArrow: false, rightArrow: false,
    pageDown: false, pageUp: false, return: false, escape: false,
    ctrl: false, shift: false, tab: false, backspace: false, delete: false, meta: false,
    ...overrides,
  } as Key;
}

const items = [
  { id: 'c1', label: 'web', sortKey: 0, data: {} },
  { id: 'c2', label: 'db', sortKey: 1, data: {} },
  { id: 'c3', label: 'cache', sortKey: 2, data: {} },
];

function makeCtx(overrides: Partial<KeyContext> = {}, state: Partial<DashboardUIState> = {}): KeyContext {
  const restart: PanelAction = { key: 'r', label: 'Restart', handler: vi.fn() };
  const panel: SidePanel = {
    id: 'containers', title: 'Containers', shortcutKey: 1,
    detailTabs: [{ label: 'Logs', render: () => [], autoScrollBottom: true }],
    getItems: () => items, getActions: () => [restart],
  };
  return {
    state: { ...initialState, ...state },
    dispatch: vi.fn(),
    panels: [panel],
    panel,
    selectedItem: items[0],
    applicableActions: [restart],
    clampedSelection: 0,
    currentItems: items,
    detailLines: [],
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

describe('handleKeyInput: too small to draw (T3)', () => {
  it('ignores everything but q', () => {
    const ctx = makeCtx({ tooSmall: true });
    for (const k of ['x', 'd', 'j', '/', 'r']) handleKeyInput(k, bareKey(), ctx, vi.fn());
    expect(ctx.dispatch).not.toHaveBeenCalled();
    expect(ctx.addToast).not.toHaveBeenCalled();
    expect(ctx.applicableActions[0].handler).not.toHaveBeenCalled();
    handleKeyInput('q', bareKey(), ctx, vi.fn());
    expect(ctx.exit).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+C still quits', () => {
    const ctx = makeCtx({ tooSmall: true });
    handleKeyInput('c', bareKey({ ctrl: true }), ctx, vi.fn());
    expect(ctx.exit).toHaveBeenCalledTimes(1);
  });

  it('even an open overlay is left alone', () => {
    const ctx = makeCtx({ tooSmall: true }, { overlay: 'confirm', confirmAction: vi.fn() });
    handleKeyInput('y', bareKey(), ctx, vi.fn());
    expect(ctx.state.confirmAction).not.toHaveBeenCalled();
  });
});

describe('handleKeyInput: chords (T28)', () => {
  it('Ctrl+Q does not quit and Ctrl+R does not restart', () => {
    const ctx = makeCtx();
    handleKeyInput('q', bareKey({ ctrl: true }), ctx, vi.fn());
    expect(ctx.exit).not.toHaveBeenCalled();
    handleKeyInput('r', bareKey({ ctrl: true }), ctx, vi.fn());
    expect(ctx.refresh).toHaveBeenCalledTimes(1);
    expect(ctx.applicableActions[0].handler).not.toHaveBeenCalled();
  });
});

describe('handleKeyInput: runs of j/k (T22)', () => {
  it('moves by the run length from the reducer state', () => {
    const ctx = makeCtx();
    handleKeyInput('jjj', bareKey(), ctx, vi.fn());
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'SCROLL_SIDE', delta: 3, itemCount: 3 });
  });

  it('ignores a mixed paste instead of firing the commands its letters name', () => {
    const ctx = makeCtx();
    handleKeyInput('jrq', bareKey(), ctx, vi.fn());
    expect(ctx.dispatch).not.toHaveBeenCalled();
    expect(ctx.exit).not.toHaveBeenCalled();
    expect(ctx.applicableActions[0].handler).not.toHaveBeenCalled();
  });

  it('a run inside an overlay goes to that overlay', () => {
    const ctx = makeCtx({}, { overlay: 'sort' });
    handleKeyInput('jj', bareKey(), ctx, vi.fn());
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'SORT_MENU_NAV', delta: 2 });
  });
});
