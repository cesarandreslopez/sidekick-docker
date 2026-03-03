import { useInput, useApp } from 'ink';
import type { SidePanel, PanelItem, PanelAction } from '../panels/types';
import type { FilterMode } from 'sidekick-docker-shared';

type OverlayKind = null | 'help' | 'context-menu' | 'filter' | 'confirm' | 'exec' | 'version' | 'log-filter';
type FocusTarget = 'side' | 'detail';

interface KeyboardState {
  overlay: OverlayKind;
  filterString: string;
  logFilterString: string;
  logFilterMode: FilterMode;
  focusTarget: FocusTarget;
  confirmAction: (() => void) | null;
  contextMenuIndex: number;
  activePanelIndex: number;
  layoutMode: 'normal' | 'expanded';
}

interface KeyboardContext {
  state: KeyboardState;
  dispatch: (action: KeyboardAction) => void;
  panels: SidePanel[];
  panel: SidePanel;
  selectedItem: PanelItem | undefined;
  contextActions: PanelAction[];
  clampedSelection: number;
  currentItems: PanelItem[];
  detailLines: string[];
  detailViewportHeight: number;
  detailTabs: { label: string }[];
  tabIdx: number;
  sideScroll: {
    selectNext(): void;
    selectPrev(): void;
    selectFirst(): void;
    selectLast(): void;
  };
  addToast: (message: string, severity: 'error' | 'warning' | 'info') => void;
  rotatePhrase: () => void;
}

// Matches the Action type from Dashboard — only the subset used by keyboard
type KeyboardAction =
  | { type: 'SWITCH_PANEL'; index: number }
  | { type: 'SELECT_ITEM'; index: number }
  | { type: 'SET_DETAIL_TAB'; index: number }
  | { type: 'CYCLE_DETAIL_TAB'; direction: 1 | -1; tabCount: number }
  | { type: 'CYCLE_LAYOUT' }
  | { type: 'TOGGLE_FOCUS' }
  | { type: 'SET_FOCUS'; target: FocusTarget }
  | { type: 'SET_OVERLAY'; overlay: OverlayKind }
  | { type: 'SET_FILTER'; value: string }
  | { type: 'SCROLL_DETAIL_DELTA'; delta: number; totalLines: number; viewportHeight: number }
  | { type: 'SCROLL_DETAIL'; offset: number }
  | { type: 'CONTEXT_MENU_NAV'; delta: number; itemCount: number }
  | { type: 'SET_CONFIRM'; action: (() => void) | null; message: string }
  | { type: 'SET_LOG_FILTER'; value: string }
  | { type: 'TOGGLE_LOG_FILTER_MODE' };

export function useKeyboardHandler(ctx: KeyboardContext): void {
  const { exit } = useApp();
  const { state, dispatch, panels, panel, selectedItem, contextActions, clampedSelection, currentItems, detailLines, detailViewportHeight, detailTabs, tabIdx, sideScroll, addToast, rotatePhrase } = ctx;

  useInput((input, key) => {
    if (state.overlay === 'exec') return;
    rotatePhrase();

    // Quit
    if (input === 'q' || (key.ctrl && input === 'c')) {
      if (state.overlay) {
        dispatch({ type: 'SET_OVERLAY', overlay: null });
        return;
      }
      exit();
      return;
    }

    // Confirm overlay
    if (state.overlay === 'confirm') {
      if (input === 'y' || input === 'Y') {
        state.confirmAction?.();
        dispatch({ type: 'SET_CONFIRM', action: null, message: '' });
        return;
      }
      if (input === 'n' || input === 'N' || key.escape) {
        dispatch({ type: 'SET_CONFIRM', action: null, message: '' });
        return;
      }
      return;
    }

    // Filter overlay (panel item filter)
    if (state.overlay === 'filter') {
      if (key.escape) {
        if (state.filterString) addToast('Filter cleared', 'info');
        dispatch({ type: 'SET_FILTER', value: '' });
        dispatch({ type: 'SET_OVERLAY', overlay: null });
        return;
      }
      if (key.return) {
        if (state.filterString) addToast(`Filter: "${state.filterString}"`, 'info');
        dispatch({ type: 'SET_OVERLAY', overlay: null });
        return;
      }
      if (key.backspace || key.delete) {
        dispatch({ type: 'SET_FILTER', value: state.filterString.slice(0, -1) });
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        dispatch({ type: 'SET_FILTER', value: state.filterString + input });
        return;
      }
      return;
    }

    // Log filter overlay
    if (state.overlay === 'log-filter') {
      if (key.escape) {
        if (state.logFilterString) addToast('Log filter cleared', 'info');
        dispatch({ type: 'SET_LOG_FILTER', value: '' });
        dispatch({ type: 'SET_OVERLAY', overlay: null });
        return;
      }
      if (key.return) {
        dispatch({ type: 'SET_OVERLAY', overlay: null });
        return;
      }
      if (key.tab) {
        dispatch({ type: 'TOGGLE_LOG_FILTER_MODE' });
        return;
      }
      if (key.backspace || key.delete) {
        dispatch({ type: 'SET_LOG_FILTER', value: state.logFilterString.slice(0, -1) });
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        dispatch({ type: 'SET_LOG_FILTER', value: state.logFilterString + input });
        return;
      }
      return;
    }

    // Context menu
    if (state.overlay === 'context-menu') {
      if (key.escape) {
        dispatch({ type: 'SET_OVERLAY', overlay: null });
        return;
      }
      if (input === 'j' || key.downArrow) {
        dispatch({ type: 'CONTEXT_MENU_NAV', delta: 1, itemCount: contextActions.length });
        return;
      }
      if (input === 'k' || key.upArrow) {
        dispatch({ type: 'CONTEXT_MENU_NAV', delta: -1, itemCount: contextActions.length });
        return;
      }
      if (key.return) {
        const action = contextActions[state.contextMenuIndex];
        if (action && selectedItem) {
          if (action.confirm) {
            dispatch({ type: 'SET_CONFIRM', action: () => { action.handler(selectedItem); addToast(action.label, 'info'); }, message: action.confirmMessage || 'Are you sure?' });
          } else {
            action.handler(selectedItem);
            addToast(action.label, 'info');
          }
          dispatch({ type: 'SET_OVERLAY', overlay: null });
        }
        return;
      }
      const match = contextActions.find(a => a.key === input);
      if (match && selectedItem) {
        if (match.confirm) {
          dispatch({ type: 'SET_CONFIRM', action: () => { match.handler(selectedItem); addToast(match.label, 'info'); }, message: match.confirmMessage || 'Are you sure?' });
        } else {
          match.handler(selectedItem);
          addToast(match.label, 'info');
        }
        dispatch({ type: 'SET_OVERLAY', overlay: null });
      }
      return;
    }

    // Help overlay
    if (state.overlay === 'help') {
      if (key.escape || input === '?') {
        dispatch({ type: 'SET_OVERLAY', overlay: null });
      }
      return;
    }

    // Version overlay
    if (state.overlay === 'version') {
      if (key.escape || input === 'V') {
        dispatch({ type: 'SET_OVERLAY', overlay: null });
      }
      return;
    }

    // Global keys
    if (key.escape) {
      if (state.filterString) {
        dispatch({ type: 'SET_FILTER', value: '' });
        return;
      }
      if (state.focusTarget === 'detail') {
        dispatch({ type: 'SET_FOCUS', target: 'side' });
        return;
      }
      return;
    }

    if (input === '?') {
      dispatch({ type: 'SET_OVERLAY', overlay: 'help' });
      return;
    }

    if (input === 'V') {
      dispatch({ type: 'SET_OVERLAY', overlay: 'version' });
      return;
    }

    // Panel switching
    const num = parseInt(input, 10);
    if (num >= 1 && num <= panels.length) {
      panels[state.activePanelIndex]?.onDeactivate?.();
      dispatch({ type: 'SWITCH_PANEL', index: num - 1 });
      panels[num - 1]?.onActivate?.();
      return;
    }

    if (key.tab) {
      dispatch({ type: 'TOGGLE_FOCUS' });
      return;
    }

    if (input === 'z') {
      dispatch({ type: 'CYCLE_LAYOUT' });
      addToast(`Layout: ${state.layoutMode === 'normal' ? 'Expanded' : 'Normal'}`, 'info');
      return;
    }

    if (input === '/') {
      dispatch({ type: 'SET_OVERLAY', overlay: 'filter' });
      return;
    }

    if (input === 'f') {
      if (panel.id === 'containers' && tabIdx === 0) {
        dispatch({ type: 'SET_OVERLAY', overlay: 'log-filter' });
        return;
      }
    }

    if (input === 'x') {
      if (selectedItem && panel.getActions().length > 0) {
        dispatch({ type: 'SET_OVERLAY', overlay: 'context-menu' });
      }
      return;
    }

    if (input === '[') {
      dispatch({ type: 'CYCLE_DETAIL_TAB', direction: -1, tabCount: detailTabs.length });
      return;
    }
    if (input === ']') {
      dispatch({ type: 'CYCLE_DETAIL_TAB', direction: 1, tabCount: detailTabs.length });
      return;
    }

    // Navigation
    if (state.focusTarget === 'side') {
      if (input === 'j' || key.downArrow) {
        if (clampedSelection < currentItems.length - 1) {
          dispatch({ type: 'SELECT_ITEM', index: clampedSelection + 1 });
          sideScroll.selectNext();
        }
        return;
      }
      if (input === 'k' || key.upArrow) {
        if (clampedSelection > 0) {
          dispatch({ type: 'SELECT_ITEM', index: clampedSelection - 1 });
          sideScroll.selectPrev();
        }
        return;
      }
      if (input === 'g') {
        dispatch({ type: 'SELECT_ITEM', index: 0 });
        sideScroll.selectFirst();
        return;
      }
      if (input === 'G') {
        dispatch({ type: 'SELECT_ITEM', index: Math.max(0, currentItems.length - 1) });
        sideScroll.selectLast();
        return;
      }
      if (key.return) {
        dispatch({ type: 'SET_FOCUS', target: 'detail' });
        return;
      }
    }

    if (state.focusTarget === 'detail') {
      if (input === 'j' || key.downArrow) {
        dispatch({ type: 'SCROLL_DETAIL_DELTA', delta: 1, totalLines: detailLines.length, viewportHeight: detailViewportHeight });
        return;
      }
      if (input === 'k' || key.upArrow) {
        dispatch({ type: 'SCROLL_DETAIL_DELTA', delta: -1, totalLines: detailLines.length, viewportHeight: detailViewportHeight });
        return;
      }
      if (input === 'h' || key.leftArrow) {
        dispatch({ type: 'SET_FOCUS', target: 'side' });
        return;
      }
      if (input === 'g') {
        dispatch({ type: 'SCROLL_DETAIL', offset: 0 });
        return;
      }
      if (input === 'G') {
        dispatch({ type: 'SCROLL_DETAIL', offset: Math.max(0, detailLines.length - detailViewportHeight) });
        return;
      }
    }

    // Panel action shortcuts
    if (selectedItem) {
      const actions = panel.getActions();
      const actionMatch = actions.find(a => a.key === input && (!a.condition || a.condition(selectedItem)));
      if (actionMatch) {
        if (actionMatch.confirm) {
          dispatch({ type: 'SET_CONFIRM', action: () => { actionMatch.handler(selectedItem); addToast(actionMatch.label, 'info'); }, message: actionMatch.confirmMessage || 'Are you sure?' });
        } else {
          actionMatch.handler(selectedItem);
          addToast(actionMatch.label, 'info');
        }
      }
    }
  });
}
