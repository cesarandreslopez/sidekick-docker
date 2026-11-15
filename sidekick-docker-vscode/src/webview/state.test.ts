import { describe, expect, it } from 'vitest';
import { createInitialState, droppedLogPrefix } from './state';

describe('createInitialState', () => {
  it('uses defaults when nothing is restored', () => {
    const state = createInitialState();
    expect(state.activePanelIndex).toBe(0);
    expect(state.selectedItemId).toBeNull();
    expect(state.detailTabIndex).toBe(0);
    expect(state.sortField).toBe('state');
    expect(state.sortReversed).toBe(false);
    expect(state.layoutMode).toBe('normal');
    expect(state.showAllContainers).toBe(true);
  });

  it('merges restored view state over defaults', () => {
    const state = createInitialState({
      activePanelIndex: 2,
      selectedItemId: 'abc123',
      detailTabIndex: 1,
      sortField: 'cpu',
      sortReversed: true,
      layoutMode: 'wide',
      showAllContainers: false,
    });
    expect(state.activePanelIndex).toBe(2);
    expect(state.selectedItemId).toBe('abc123');
    expect(state.detailTabIndex).toBe(1);
    expect(state.sortField).toBe('cpu');
    expect(state.sortReversed).toBe(true);
    expect(state.layoutMode).toBe('wide');
    expect(state.showAllContainers).toBe(false);
  });

  it('accepts a partial restore', () => {
    const state = createInitialState({ sortField: 'mem' });
    expect(state.sortField).toBe('mem');
    expect(state.activePanelIndex).toBe(0);
    expect(state.layoutMode).toBe('normal');
  });

  it('never restores transient state (overlays, filters, toasts)', () => {
    const state = createInitialState({ activePanelIndex: 3 });
    expect(state.filterString).toBe('');
    expect(state.toasts).toEqual([]);
    expect(state.confirmVisible).toBe(false);
    expect(state.contextMenuVisible).toBe(false);
    expect(state.focusTarget).toBe('side');
  });
});

describe('droppedLogPrefix', () => {
  const line = (message: string, timestamp: string | null = null) => ({ timestamp, stream: 'stdout' as const, message });
  const lines = (...messages: string[]) => messages.map(m => line(m));

  it('is 0 when lines were only appended', () => {
    expect(droppedLogPrefix(lines('a', 'b'), lines('a', 'b', 'c'))).toBe(0);
    expect(droppedLogPrefix(lines('a', 'b'), lines('a', 'b'))).toBe(0);
  });

  it('counts lines a full ring buffer dropped from the front', () => {
    expect(droppedLogPrefix(lines('a', 'b', 'c', 'd'), lines('c', 'd', 'e', 'f'))).toBe(2);
    expect(droppedLogPrefix(lines('a', 'b', 'c'), lines('c', 'd', 'e'))).toBe(2);
  });

  it('tells repeated messages apart by their position, not just the first match', () => {
    // "x" first appears at 0, but only dropping 2 lines up the rest.
    expect(droppedLogPrefix(lines('x', 'y', 'x', 'z'), lines('x', 'z', 'w'))).toBe(2);
  });

  it('is null when the lists do not line up as drop-then-append', () => {
    expect(droppedLogPrefix(lines('a', 'b'), lines('q', 'r'))).toBeNull();
    expect(droppedLogPrefix(lines('a', 'b', 'c'), lines('a', 'x', 'c', 'd'))).toBeNull();
    expect(droppedLogPrefix([], lines('a'))).toBeNull();
    expect(droppedLogPrefix(lines('a'), [])).toBeNull();
  });

  it('keys on timestamp and stream as well as text', () => {
    expect(droppedLogPrefix([line('a', 't1'), line('a', 't2')], [line('a', 't2'), line('b', 't3')])).toBe(1);
    expect(droppedLogPrefix([line('a', 't1')], [{ timestamp: 't1', stream: 'stderr', message: 'a' }])).toBeNull();
  });
});
