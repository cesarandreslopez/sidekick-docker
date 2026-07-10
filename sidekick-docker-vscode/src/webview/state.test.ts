import { describe, expect, it } from 'vitest';
import { createInitialState } from './state';

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
