import { describe, expect, it, vi } from 'vitest';
import type { Key } from 'ink';
import { findGlobalBinding } from './keyRegistry';
import type { KeyContext } from './keyRegistry';
import type { DashboardUIState } from './dashboardTypes';
import type { SidePanel } from '../panels/types';
import { initialState } from './Dashboard';
import { compareColumnAt, compareColumnWidth } from './windowLines';
import { parseMouseEvents } from './mouse/parseMouseEvent';

function bareKey(overrides: Partial<Key> = {}): Key {
  return {
    upArrow: false, downArrow: false, leftArrow: false, rightArrow: false,
    pageDown: false, pageUp: false, return: false, escape: false,
    ctrl: false, shift: false, tab: false, backspace: false, delete: false, meta: false,
    ...overrides,
  } as Key;
}

const panel: SidePanel = {
  id: 'containers', title: 'Containers', shortcutKey: 1,
  detailTabs: [{ label: 'Logs', render: () => [], autoScrollBottom: true }],
  getItems: () => [], getActions: () => [],
};

function makeCtx(state: Partial<DashboardUIState> = {}): KeyContext {
  const item = { id: 'c2', label: 'db', name: 'db', sortKey: 0, data: {} };
  return {
    state: { ...initialState, ...state },
    dispatch: vi.fn(), panels: [panel], panel, selectedItem: item, applicableActions: [],
    clampedSelection: 0, currentItems: [item], detailLines: [], detailViewportHeight: 10,
    detailTabs: panel.detailTabs, tabIdx: 0,
    sideScroll: { selectNext: vi.fn(), selectPrev: vi.fn(), selectFirst: vi.fn(), selectLast: vi.fn(), setSelected: vi.fn() },
    addToast: vi.fn().mockReturnValue(1), exit: vi.fn(), refresh: vi.fn(), helpMaxScroll: 0, tooSmall: false,
    secondaryDetailLineCount: 0,
  };
}

const run = (ctx: KeyContext, input: string, key: Key = bareKey()) => findGlobalBinding(input, key)!.run(ctx, input, key);

describe('m while comparing ends the comparison (T13)', () => {
  it('clears the pin instead of re-pinning the selected item', () => {
    const ctx = makeCtx({ compareItemIds: { containers: 'c1' } });
    run(ctx, 'm');
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'CLEAR_COMPARE', panelId: 'containers' });
    expect(ctx.dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'PIN_COMPARE' }));
    expect(ctx.addToast).toHaveBeenCalledWith('Comparison cleared', 'info');
  });

  it('pins when nothing is pinned', () => {
    const ctx = makeCtx();
    run(ctx, 'm');
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'PIN_COMPARE', panelId: 'containers', itemId: 'c2' });
  });
});

describe('Esc order: filter, then compare, then focus (T13)', () => {
  it('clears the filter first', () => {
    const ctx = makeCtx({ filterString: 'web', compareItemIds: { containers: 'c1' }, focusTarget: 'detail' });
    run(ctx, '', bareKey({ escape: true }));
    expect(ctx.dispatch).toHaveBeenCalledTimes(1);
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'SET_FILTER', value: '' });
  });

  it('then ends the comparison', () => {
    const ctx = makeCtx({ compareItemIds: { containers: 'c1' }, focusTarget: 'detail' });
    run(ctx, '', bareKey({ escape: true }));
    expect(ctx.dispatch).toHaveBeenCalledTimes(1);
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'CLEAR_COMPARE', panelId: 'containers' });
  });

  it('then moves focus back to the list', () => {
    const ctx = makeCtx({ focusTarget: 'detail' });
    run(ctx, '', bareKey({ escape: true }));
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'SET_FOCUS', target: 'side' });
  });
});

describe('compareColumnAt (T15)', () => {
  it('splits the pane at the divider the columns are drawn with', () => {
    const left = 28;
    const width = 85;
    const col = compareColumnWidth(width);
    const divider = left + 1 + col + 1;
    expect(compareColumnAt(left + 1, left, width)).toBe('primary');
    expect(compareColumnAt(divider, left, width)).toBe('primary');
    expect(compareColumnAt(divider + 1, left, width)).toBe('secondary');
    expect(compareColumnAt(left + width - 2, left, width)).toBe('secondary');
  });
});

describe('parseMouseEvents (T15)', () => {
  it('returns every report in a chunk, in order', () => {
    const events = parseMouseEvents('\x1b[<65;10;5M\x1b[<65;10;5M\x1b[<64;40;7M');
    expect(events.map(e => e.scrollDirection)).toEqual(['down', 'down', 'up']);
    expect(events[2]).toMatchObject({ x: 39, y: 6, type: 'scroll' });
  });

  it('ignores text that is not a report', () => {
    expect(parseMouseEvents('jjj')).toEqual([]);
    expect(parseMouseEvents(Buffer.from('\x1b[<0;3;4M'))).toHaveLength(1);
  });
});
