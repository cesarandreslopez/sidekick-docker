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
  /** Rows that fit in one detail-pane page (for PageUp/PageDown & ctrl+d/u). */
  getDetailPageRows(): number;
  /** Scroll the secondary compare log pane (Shift+J/K). */
  scrollComparePane(delta: number): void;
  toggleComparePin(itemId: string): void;
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

/**
 * True when the element takes text input, so global shortcuts must not fire
 * and focus must not be stolen back to the list.
 */
export function isTypingTarget(el: Element | null): boolean {
  return el instanceof HTMLInputElement
    || el instanceof HTMLTextAreaElement
    || (el instanceof HTMLElement && el.isContentEditable);
}

export function handleGlobalKeydown(e: KeyboardEvent, ctx: KeyboardContext): void {
  const { state } = ctx;

  // Typing guard — while an input/textarea/contentEditable is focused, no
  // global shortcut may fire (fixes actions triggering from the log filter).
  const active = document.activeElement;
  if (isTypingTarget(active)) {
    if (e.key === 'Escape') {
      e.preventDefault();
      (active as HTMLElement).blur();
      if (state.filterVisible) {
        // Preserve item-filter Escape semantics: clear + close.
        state.filterString = '';
        ctx.hideFilter();
        ctx.renderAll();
      }
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (state.filterVisible) {
        // Preserve item-filter Enter semantics: commit + close.
        ctx.hideFilter();
      } else {
        // Log filter input: commit by blurring.
        (active as HTMLElement).blur();
      }
      return;
    }
    return;
  }

  ctx.rotatePhrase();

  // Confirm overlay — Enter is NOT intercepted here: it activates the
  // focused button (Cancel by default), so destructive confirm needs an
  // explicit y or a deliberate focus move.
  if (state.confirmVisible) {
    if (e.key === 'y' || e.key === 'Y') {
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

  // Focus toggle (Tab). When an ARIA tab element has focus, let native Tab
  // traverse so keyboard/AT users can reach the tab controls.
  if (e.key === 'Tab') {
    if (active instanceof HTMLElement && active.getAttribute('role') === 'tab') {
      return;
    }
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

  // Compare pin toggle (m, containers/services — TUI parity)
  if (e.key === 'm' && (ctx.getPanel().id === 'containers' || ctx.getPanel().id === 'services')) {
    e.preventDefault();
    const items = ctx.getFilteredItems();
    const item = ctx.getSelectedItem(items);
    if (item) ctx.toggleComparePin(item.id);
    return;
  }

  // Focus the log filter input when the active tab has one (f)
  if (e.key === 'f') {
    const logFilterInput = document.getElementById('log-filter-input') as HTMLInputElement | null;
    if (logFilterInput) {
      e.preventDefault();
      logFilterInput.focus();
      return;
    }
  }

  // Manual refresh (F5)
  if (e.key === 'F5') {
    e.preventDefault();
    ctx.post({ type: 'requestRefresh' });
    ctx.addToast('Refreshing\u2026', 'info');
    return;
  }

  // Secondary compare pane scrolling (Shift+J/K)
  if (e.key === 'J' || e.key === 'K') {
    e.preventDefault();
    ctx.scrollComparePane(e.key === 'J' ? 3 : -3);
    return;
  }

  // Page scrolling: PageUp/PageDown full page, ctrl+d/ctrl+u half page
  const pageDir = e.key === 'PageDown' ? 1 : e.key === 'PageUp' ? -1 : 0;
  const halfDir = e.ctrlKey && e.key === 'd' ? 1 : e.ctrlKey && e.key === 'u' ? -1 : 0;
  if (pageDir !== 0 || halfDir !== 0) {
    e.preventDefault();
    const dir = pageDir !== 0 ? pageDir : halfDir;
    if (state.focusTarget === 'detail') {
      const rows = ctx.getDetailPageRows();
      const step = pageDir !== 0 ? rows : Math.max(1, Math.floor(rows / 2));
      ctx.scrollDetail(dir * step);
    } else {
      ctx.navigateSide(dir * 10);
    }
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
