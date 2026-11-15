import { describe, it, expect } from 'vitest';
import { reducer, initialState } from './Dashboard';

describe('log follow reducer semantics', () => {
  // maxScrollOffset(100, 10) = 91 (the ▲ indicator consumes one viewport row).
  it('pauses follow when the user scrolls up on a logs tab', () => {
    const scrolledToBottom = { ...initialState, detailScrollOffset: 91 };
    const next = reducer(scrolledToBottom, {
      type: 'SCROLL_DETAIL_DELTA', delta: -1, totalLines: 100, viewportHeight: 10, followTab: true,
    });
    expect(next.logFollow).toBe(false);
    expect(next.detailScrollOffset).toBe(90);
  });

  it('resumes follow when scrolling reaches the bottom', () => {
    const paused = { ...initialState, logFollow: false, detailScrollOffset: 90 };
    const next = reducer(paused, {
      type: 'SCROLL_DETAIL_DELTA', delta: 1, totalLines: 100, viewportHeight: 10, followTab: true,
    });
    expect(next.logFollow).toBe(true);
  });

  it('G (jump to bottom) resumes follow', () => {
    const paused = { ...initialState, logFollow: false, detailScrollOffset: 3 };
    const next = reducer(paused, {
      type: 'SCROLL_DETAIL', offset: 91, followTab: true, totalLines: 100, viewportHeight: 10,
    });
    expect(next.logFollow).toBe(true);
    expect(next.detailScrollOffset).toBe(91);
  });

  it('g (jump to top) pauses follow', () => {
    const next = reducer(initialState, {
      type: 'SCROLL_DETAIL', offset: 0, followTab: true, totalLines: 100, viewportHeight: 10,
    });
    expect(next.logFollow).toBe(false);
  });

  it('auto-scroll dispatches (no followTab) never change the follow flag', () => {
    const paused = { ...initialState, logFollow: false };
    const next = reducer(paused, { type: 'SCROLL_DETAIL', offset: 95 });
    expect(next.logFollow).toBe(false);
  });

  it('selection, tab, and panel changes reset follow to true', () => {
    const paused = { ...initialState, logFollow: false };
    expect(reducer(paused, { type: 'SELECT_ITEM', index: 1 }).logFollow).toBe(true);
    expect(reducer(paused, { type: 'SET_DETAIL_TAB', index: 1 }).logFollow).toBe(true);
    expect(reducer(paused, { type: 'CYCLE_DETAIL_TAB', direction: 1, tabCount: 3 }).logFollow).toBe(true);
    expect(reducer(paused, { type: 'SWITCH_PANEL', index: 1 }).logFollow).toBe(true);
    expect(reducer(paused, { type: 'SCROLL_SIDE', delta: 1, itemCount: 3 }).logFollow).toBe(true);
  });
});

describe('toast queue reducer semantics', () => {
  it('caps the queue at 5, dropping the oldest', () => {
    let state = initialState;
    for (let i = 1; i <= 7; i++) {
      state = reducer(state, { type: 'ADD_TOAST', toast: { id: i, message: `t${i}`, severity: 'info' } });
    }
    expect(state.toasts.map(t => t.id)).toEqual([3, 4, 5, 6, 7]);
  });
});

describe('selection by id (T3)', () => {
  it('SELECT_ITEM records the id it is given, or clears it for the resolver', () => {
    expect(reducer(initialState, { type: 'SELECT_ITEM', index: 2, id: 'c3' }).selectedItemId).toBe('c3');
    expect(reducer({ ...initialState, selectedItemId: 'c3' }, { type: 'SELECT_ITEM', index: 1 }).selectedItemId).toBeNull();
  });

  it('RESOLVE_SELECTION follows the item without resetting scroll or follow', () => {
    const reading = { ...initialState, selectedItemIndex: 0, selectedItemId: 'c1', detailScrollOffset: 40, detailScrollPerTab: { 2: 7 }, logFollow: false };
    const next = reducer(reading, { type: 'RESOLVE_SELECTION', index: 3, id: 'c1' });
    expect(next).toMatchObject({ selectedItemIndex: 3, selectedItemId: 'c1', detailScrollOffset: 40, detailScrollPerTab: { 2: 7 }, logFollow: false });
  });

  it('switching panel, toggling running-only and wheel-scrolling the list drop the id', () => {
    const selected = { ...initialState, selectedItemId: 'c1', selectedItemIndex: 1 };
    expect(reducer(selected, { type: 'SWITCH_PANEL', index: 2 }).selectedItemId).toBeNull();
    expect(reducer(selected, { type: 'TOGGLE_SHOW_ALL' }).selectedItemId).toBeNull();
    expect(reducer(selected, { type: 'SCROLL_SIDE', delta: 1, itemCount: 5 })).toMatchObject({ selectedItemIndex: 2, selectedItemId: null });
  });
});

describe('list scroll resets (T22)', () => {
  it('SCROLL_SIDE resets every detail offset, like SELECT_ITEM', () => {
    const scrolled = { ...initialState, detailScrollOffset: 9, detailScrollPerTab: { 1: 4 }, secondaryDetailScrollOffset: 6, secondaryFollow: false };
    const next = reducer(scrolled, { type: 'SCROLL_SIDE', delta: 3, itemCount: 10 });
    expect(next).toMatchObject({ detailScrollOffset: 0, detailScrollPerTab: {}, secondaryDetailScrollOffset: 0, secondaryFollow: true });
  });
});

describe('compare pin (T1)', () => {
  it('pinning the selected item keeps the pin (one pane until another item is selected)', () => {
    const pinned = reducer(initialState, { type: 'PIN_COMPARE', panelId: 'containers', itemId: 'c1' });
    expect(pinned.compareItemIds.containers).toBe('c1');
    // Moving the selection does not touch the pin.
    expect(reducer(pinned, { type: 'SELECT_ITEM', index: 1, id: 'c2' }).compareItemIds.containers).toBe('c1');
    // m on the pinned item again unpins.
    expect(reducer(pinned, { type: 'PIN_COMPARE', panelId: 'containers', itemId: 'c1' }).compareItemIds.containers).toBeNull();
  });

  it('CLEAR_COMPARE drops only that panel\'s pin', () => {
    const state = { ...initialState, compareItemIds: { containers: 'c1', services: 'service:shop:web' } };
    expect(reducer(state, { type: 'CLEAR_COMPARE', panelId: 'containers' }).compareItemIds).toEqual({ containers: null, services: 'service:shop:web' });
  });

  it('the compare pane has its own follow: K pauses it, J to the bottom resumes, primary follow untouched', () => {
    // maxScrollOffset(100, 10) = 91
    const atBottom = { ...initialState, secondaryDetailScrollOffset: 91 };
    const up = reducer(atBottom, { type: 'SCROLL_SECONDARY_DETAIL_DELTA', delta: -1, totalLines: 100, viewportHeight: 10 });
    expect(up).toMatchObject({ secondaryDetailScrollOffset: 90, secondaryFollow: false, logFollow: true });
    // The follow effect's own dispatch does not resume it.
    expect(reducer(up, { type: 'SCROLL_SECONDARY_DETAIL', offset: 91 }).secondaryFollow).toBe(false);
    const down = reducer(up, { type: 'SCROLL_SECONDARY_DETAIL_DELTA', delta: 1, totalLines: 100, viewportHeight: 10 });
    expect(down.secondaryFollow).toBe(true);
  });

  it('RESUME_SECONDARY_FOLLOW (G while comparing) tails the compare pane without touching the primary', () => {
    const paused = { ...initialState, secondaryFollow: false, secondaryDetailScrollOffset: 12, logFollow: false, detailScrollOffset: 5 };
    const next = reducer(paused, { type: 'RESUME_SECONDARY_FOLLOW' });
    // The follow effect then scrolls it to the bottom.
    expect(next).toMatchObject({ secondaryFollow: true, secondaryDetailScrollOffset: 12, logFollow: false, detailScrollOffset: 5 });
  });

  it('a new pin or a new selection tails the compare pane again', () => {
    const paused = { ...initialState, secondaryFollow: false };
    expect(reducer(paused, { type: 'PIN_COMPARE', panelId: 'containers', itemId: 'c9' }).secondaryFollow).toBe(true);
    expect(reducer(paused, { type: 'SELECT_ITEM', index: 0 }).secondaryFollow).toBe(true);
  });
});

describe('expanded layout focus (T15)', () => {
  it('keeps focus on the detail pane while the list is hidden', () => {
    const expanded = reducer(initialState, { type: 'CYCLE_LAYOUT' });
    const full = reducer(expanded, { type: 'CYCLE_LAYOUT' });
    expect(full).toMatchObject({ layoutMode: 'expanded', focusTarget: 'detail' });
    expect(reducer(full, { type: 'TOGGLE_FOCUS' }).focusTarget).toBe('detail');
    expect(reducer(full, { type: 'SET_FOCUS', target: 'side' }).focusTarget).toBe('detail');
    // Back to Normal, focus moves freely again.
    const normal = reducer(full, { type: 'CYCLE_LAYOUT' });
    expect(reducer(normal, { type: 'TOGGLE_FOCUS' }).focusTarget).toBe('side');
  });
});

describe('sort menu (T17)', () => {
  it('opens on the current field, not where the cursor was left', () => {
    const state = { ...initialState, sortField: 'mem' as const, sortMenuIndex: 6 };
    expect(reducer(state, { type: 'SET_OVERLAY', overlay: 'sort' }).sortMenuIndex).toBe(3);
    // Other overlays leave the sort cursor alone.
    expect(reducer(state, { type: 'SET_OVERLAY', overlay: 'help' }).sortMenuIndex).toBe(6);
  });
});

describe('mouse capture (A1)', () => {
  it('TOGGLE_MOUSE flips capture', () => {
    expect(initialState.mouseEnabled).toBe(true);
    expect(reducer(initialState, { type: 'TOGGLE_MOUSE' }).mouseEnabled).toBe(false);
  });
});
