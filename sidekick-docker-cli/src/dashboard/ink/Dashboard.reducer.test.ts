import { describe, it, expect } from 'vitest';
import { reducer, initialState } from './Dashboard';

describe('log follow reducer semantics', () => {
  it('pauses follow when the user scrolls up on a logs tab', () => {
    const scrolledToBottom = { ...initialState, detailScrollOffset: 90 };
    const next = reducer(scrolledToBottom, {
      type: 'SCROLL_DETAIL_DELTA', delta: -1, totalLines: 100, viewportHeight: 10, followTab: true,
    });
    expect(next.logFollow).toBe(false);
    expect(next.detailScrollOffset).toBe(89);
  });

  it('resumes follow when scrolling reaches the bottom', () => {
    const paused = { ...initialState, logFollow: false, detailScrollOffset: 89 };
    const next = reducer(paused, {
      type: 'SCROLL_DETAIL_DELTA', delta: 1, totalLines: 100, viewportHeight: 10, followTab: true,
    });
    expect(next.logFollow).toBe(true);
  });

  it('G (jump to bottom) resumes follow', () => {
    const paused = { ...initialState, logFollow: false, detailScrollOffset: 3 };
    const next = reducer(paused, {
      type: 'SCROLL_DETAIL', offset: 90, followTab: true, totalLines: 100, viewportHeight: 10,
    });
    expect(next.logFollow).toBe(true);
    expect(next.detailScrollOffset).toBe(90);
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
