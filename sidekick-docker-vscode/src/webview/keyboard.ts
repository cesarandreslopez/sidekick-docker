import type { WebviewMessage } from '../types/messages';
import type { PanelDefinition, PanelItem, ActionDefinition } from './panels/types';
import type { WebviewState, ToastSeverity } from './state';
import { SORT_OPTIONS } from './state';

/** Callbacks/state the global keydown handler needs from the dashboard. */
export interface KeyboardContext {
  state: WebviewState;
  panelCount: number;
  getPanel(): PanelDefinition;
  getFilteredItems(): PanelItem[];
  getSelectedItem(items: PanelItem[]): PanelItem | undefined;
  switchPanel(idx: number): void;
  setDetailTab(idx: number): void;
  navigateSide(delta: number): void;
  scrollDetail(delta: number): void;
  scrollDetailToTop(): void;
  scrollDetailToBottom(): void;
  executeAction(action: ActionDefinition, itemId: string): void;
  executeContextAction(idx: number, actions: ActionDefinition[]): void;
  showFilter(): void;
  hideFilter(): void;
  hideConfirm(): void;
  hideContextMenu(): void;
  showContextMenu(items: PanelItem[]): void;
  renderContextMenu(actions: ActionDefinition[]): void;
  renderSortOverlay(): void;
  renderHelpOverlay(): void;
  renderVersionOverlay(): void;
  renderAll(): void;
  addToast(message: string, severity: ToastSeverity): void;
  post(msg: WebviewMessage): void;
  rotatePhrase(): void;
}

export function handleGlobalKeydown(e: KeyboardEvent, ctx: KeyboardContext): void {
  const { state } = ctx;
  ctx.rotatePhrase();

  // Confirm overlay
  if (state.confirmVisible) {
    if (e.key === 'y' || e.key === 'Y' || e.key === 'Enter') {
      e.preventDefault();
      state.confirmCallback?.();
      ctx.hideConfirm();
      return;
    }
    if (e.key === 'n' || e.key === 'N' || e.key === 'Escape') {
      e.preventDefault();
      ctx.hideConfirm();
      return;
    }
    return;
  }

  // Filter overlay
  if (state.filterVisible) {
    if (e.key === 'Escape') {
      e.preventDefault();
      state.filterString = '';
      ctx.hideFilter();
      ctx.renderAll();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      ctx.hideFilter();
      return;
    }
    // Let the input handle typing
    return;
  }

  // Context menu
  if (state.contextMenuVisible) {
    if (e.key === 'Escape') {
      e.preventDefault();
      ctx.hideContextMenu();
      return;
    }
    if (e.key === 'j' || e.key === 'ArrowDown') {
      e.preventDefault();
      const items = ctx.getFilteredItems();
      const item = ctx.getSelectedItem(items);
      if (!item || !state.snapshot) return;
      const actions = ctx.getPanel().getActions(item, state.snapshot);
      state.contextMenuIndex = (state.contextMenuIndex + 1) % actions.length;
      ctx.renderContextMenu(actions);
      return;
    }
    if (e.key === 'k' || e.key === 'ArrowUp') {
      e.preventDefault();
      const items = ctx.getFilteredItems();
      const item = ctx.getSelectedItem(items);
      if (!item || !state.snapshot) return;
      const actions = ctx.getPanel().getActions(item, state.snapshot);
      state.contextMenuIndex = (state.contextMenuIndex - 1 + actions.length) % actions.length;
      ctx.renderContextMenu(actions);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const items = ctx.getFilteredItems();
      const item = ctx.getSelectedItem(items);
      if (!item || !state.snapshot) return;
      const actions = ctx.getPanel().getActions(item, state.snapshot);
      ctx.executeContextAction(state.contextMenuIndex, actions);
      return;
    }
    // Check for action key shortcut
    const items = ctx.getFilteredItems();
    const item = ctx.getSelectedItem(items);
    if (item && state.snapshot) {
      const actions = ctx.getPanel().getActions(item, state.snapshot);
      const match = actions.find(a => a.key === e.key);
      if (match) {
        e.preventDefault();
        ctx.hideContextMenu();
        ctx.executeAction(match, item.id);
        return;
      }
    }
    return;
  }

  // Sort overlay
  if (state.sortOverlayVisible) {
    if (e.key === 'Escape') {
      e.preventDefault();
      state.sortOverlayVisible = false;
      ctx.renderSortOverlay();
      return;
    }
    if (e.key === 'j' || e.key === 'ArrowDown') {
      e.preventDefault();
      state.sortMenuIndex = (state.sortMenuIndex + 1) % SORT_OPTIONS.length;
      ctx.renderSortOverlay();
      return;
    }
    if (e.key === 'k' || e.key === 'ArrowUp') {
      e.preventDefault();
      state.sortMenuIndex = (state.sortMenuIndex - 1 + SORT_OPTIONS.length) % SORT_OPTIONS.length;
      ctx.renderSortOverlay();
      return;
    }
    if (e.key === 'R') {
      e.preventDefault();
      state.sortReversed = !state.sortReversed;
      ctx.post({ type: 'sortChanged', field: state.sortField, reversed: state.sortReversed });
      ctx.addToast(`Sort: ${state.sortReversed ? 'descending' : 'ascending'}`, 'info');
      ctx.renderSortOverlay();
      ctx.renderAll();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      state.sortField = SORT_OPTIONS[state.sortMenuIndex].field;
      state.sortOverlayVisible = false;
      ctx.post({ type: 'sortChanged', field: state.sortField, reversed: state.sortReversed });
      ctx.addToast(`Sort: ${SORT_OPTIONS[state.sortMenuIndex].label}`, 'info');
      ctx.renderSortOverlay();
      ctx.renderAll();
      return;
    }
    return;
  }

  // Help overlay
  if (state.helpOverlayVisible) {
    if (e.key === 'Escape' || e.key === '?') {
      e.preventDefault();
      state.helpOverlayVisible = false;
      ctx.renderHelpOverlay();
      return;
    }
    return;
  }

  // Version overlay
  if (state.versionOverlayVisible) {
    if (e.key === 'Escape' || e.key === 'V') {
      e.preventDefault();
      state.versionOverlayVisible = false;
      ctx.renderVersionOverlay();
      return;
    }
    return;
  }

  // ── Global keys ────────────────────────────────────────────────
  // Help overlay
  if (e.key === '?') {
    e.preventDefault();
    state.helpOverlayVisible = true;
    ctx.renderHelpOverlay();
    return;
  }

  // Version overlay
  if (e.key === 'V') {
    e.preventDefault();
    state.versionOverlayVisible = true;
    ctx.renderVersionOverlay();
    return;
  }

  // Panel switching: 1-5
  const num = parseInt(e.key, 10);
  if (num >= 1 && num <= ctx.panelCount) {
    e.preventDefault();
    ctx.switchPanel(num - 1);
    return;
  }

  // Focus toggle (Tab)
  if (e.key === 'Tab') {
    e.preventDefault();
    state.focusTarget = state.focusTarget === 'side' ? 'detail' : 'side';
    ctx.renderAll();
    return;
  }

  // Layout mode cycle (z)
  if (e.key === 'z') {
    e.preventDefault();
    const modes: Array<'normal' | 'wide' | 'expanded'> = ['normal', 'wide', 'expanded'];
    const curIdx = modes.indexOf(state.layoutMode);
    state.layoutMode = modes[(curIdx + 1) % modes.length];
    ctx.addToast(`Layout: ${state.layoutMode.charAt(0).toUpperCase() + state.layoutMode.slice(1)}`, 'info');
    ctx.renderAll();
    return;
  }

  // Show all/running toggle (a key, containers only)
  if (e.key === 'a' && ctx.getPanel().id === 'containers') {
    e.preventDefault();
    state.showAllContainers = !state.showAllContainers;
    ctx.addToast(state.showAllContainers ? 'Show all' : 'Running only', 'info');
    ctx.renderAll();
    return;
  }

  // Sort overlay (o key, containers only)
  if (e.key === 'o' && ctx.getPanel().id === 'containers') {
    e.preventDefault();
    state.sortOverlayVisible = true;
    ctx.renderSortOverlay();
    return;
  }

  // Sort reverse toggle (R key, containers only)
  if (e.key === 'R' && ctx.getPanel().id === 'containers') {
    e.preventDefault();
    state.sortReversed = !state.sortReversed;
    ctx.post({ type: 'sortChanged', field: state.sortField, reversed: state.sortReversed });
    ctx.addToast(`Sort: ${state.sortReversed ? 'descending' : 'ascending'}`, 'info');
    ctx.renderAll();
    return;
  }

  // Detail tab cycling
  if (e.key === '[') {
    e.preventDefault();
    const tabCount = ctx.getPanel().detailTabs.length;
    if (tabCount > 1) {
      ctx.setDetailTab((state.detailTabIndex - 1 + tabCount) % tabCount);
    }
    return;
  }
  if (e.key === ']') {
    e.preventDefault();
    const tabCount = ctx.getPanel().detailTabs.length;
    if (tabCount > 1) {
      ctx.setDetailTab((state.detailTabIndex + 1) % tabCount);
    }
    return;
  }

  // Filter
  if (e.key === '/') {
    e.preventDefault();
    ctx.showFilter();
    return;
  }

  // Context menu
  if (e.key === 'x') {
    e.preventDefault();
    ctx.showContextMenu(ctx.getFilteredItems());
    return;
  }

  // Navigation (focus-aware)
  if (state.focusTarget === 'side') {
    if (e.key === 'j' || e.key === 'ArrowDown') {
      e.preventDefault();
      ctx.navigateSide(1);
      return;
    }
    if (e.key === 'k' || e.key === 'ArrowUp') {
      e.preventDefault();
      ctx.navigateSide(-1);
      return;
    }
    if (e.key === 'g') {
      e.preventDefault();
      ctx.navigateSide(-Infinity);
      return;
    }
    if (e.key === 'G') {
      e.preventDefault();
      ctx.navigateSide(Infinity);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      state.focusTarget = 'detail';
      ctx.renderAll();
      return;
    }
  }

  if (state.focusTarget === 'detail') {
    if (e.key === 'j' || e.key === 'ArrowDown') {
      e.preventDefault();
      ctx.scrollDetail(1);
      return;
    }
    if (e.key === 'k' || e.key === 'ArrowUp') {
      e.preventDefault();
      ctx.scrollDetail(-1);
      return;
    }
    if (e.key === 'h' || e.key === 'ArrowLeft') {
      e.preventDefault();
      state.focusTarget = 'side';
      ctx.renderAll();
      return;
    }
    if (e.key === 'g') {
      e.preventDefault();
      ctx.scrollDetailToTop();
      return;
    }
    if (e.key === 'G') {
      e.preventDefault();
      ctx.scrollDetailToBottom();
      return;
    }
  }

  // Escape: clear filter or return focus to side
  if (e.key === 'Escape') {
    e.preventDefault();
    if (state.filterString) {
      state.filterString = '';
      ctx.post({ type: 'filterChange', filter: '' });
      ctx.renderAll();
      return;
    }
    if (state.focusTarget === 'detail') {
      state.focusTarget = 'side';
      ctx.renderAll();
      return;
    }
    return;
  }

  // Action shortcut keys (when no overlay is active)
  const items = ctx.getFilteredItems();
  const selItem = ctx.getSelectedItem(items);
  if (selItem && state.snapshot) {
    const actions = ctx.getPanel().getActions(selItem, state.snapshot);
    const match = actions.find(a => a.key === e.key);
    if (match) {
      e.preventDefault();
      ctx.executeAction(match, selItem.id);
    }
  }
}
