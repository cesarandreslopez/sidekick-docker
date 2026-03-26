import { useInput, useApp } from 'ink';
import type { SidePanel, PanelItem, PanelAction } from '../panels/types';
import type { DashboardUIState, Action, SortField, ToastSeverity } from './dashboardTypes';

const SORT_FIELDS: SortField[] = ['state', 'name', 'cpu', 'mem', 'net', 'io', 'pids'];

interface KeyboardContext {
  state: DashboardUIState;
  dispatch: (action: Action) => void;
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
  panelActions: PanelAction[];
  sideScroll: {
    selectNext(): void;
    selectPrev(): void;
    selectFirst(): void;
    selectLast(): void;
  };
  addToast: (message: string, severity: ToastSeverity, duration?: number) => number;
  removeToast: (id: number) => void;
  rotatePhrase: () => void;
  secondaryDetailLineCount: number;
}

function isPromise(value: unknown): value is Promise<void> {
  return value != null && typeof (value as Promise<void>).then === 'function';
}

/** Execute a panel action with async feedback: in-progress spinner → success/error toast. */
function executeAction(
  action: PanelAction,
  item: PanelItem,
  dispatch: (action: Action) => void,
  addToast: (message: string, severity: ToastSeverity, duration?: number) => number,
  removeToast: (id: number) => void,
): void {
  const run = () => {
    const result = action.handler(item);
    if (isPromise(result)) {
      const progressId = addToast(`${action.label}\u2026`, 'info');
      result
        .then(() => { removeToast(progressId); addToast(action.label, 'success'); })
        .catch(() => { removeToast(progressId); addToast(`${action.label} failed`, 'error'); });
    } else {
      addToast(action.label, 'info', 2000);
    }
  };

  if (action.confirm) {
    dispatch({ type: 'SET_CONFIRM', action: run, message: action.confirmMessage || 'Are you sure?', severity: action.confirmSeverity ?? 'high' });
  } else {
    run();
  }
}

/** Handle keyboard input for a text filter overlay (panel filter or log filter). */
function handleFilterInput(
  input: string,
  key: { escape: boolean; return: boolean; backspace: boolean; delete: boolean; tab: boolean; ctrl: boolean; meta: boolean },
  opts: {
    currentValue: string;
    setAction: string;
    clearToast?: string;
    dispatch: (action: Action) => void;
    addToast: (message: string, severity: ToastSeverity, duration?: number) => number;
    onTab?: () => void;
  },
): void {
  const { currentValue, setAction, clearToast, dispatch, addToast, onTab } = opts;
  if (key.escape) {
    if (currentValue && clearToast) addToast(clearToast, 'info');
    dispatch({ type: setAction, value: '' } as Action);
    dispatch({ type: 'SET_OVERLAY', overlay: null });
    return;
  }
  if (key.return) {
    if (setAction === 'SET_FILTER' && currentValue) addToast(`Filter: "${currentValue}"`, 'info');
    dispatch({ type: 'SET_OVERLAY', overlay: null });
    return;
  }
  if (key.tab && onTab) {
    onTab();
    return;
  }
  if (key.backspace || key.delete) {
    dispatch({ type: setAction, value: currentValue.slice(0, -1) } as Action);
    return;
  }
  if (input && !key.ctrl && !key.meta) {
    dispatch({ type: setAction, value: currentValue + input } as Action);
  }
}

export function useKeyboardHandler(ctx: KeyboardContext): void {
  const { exit } = useApp();
  const { state, dispatch, panels, panel, selectedItem, contextActions, clampedSelection, currentItems, detailLines, detailViewportHeight, detailTabs, tabIdx, panelActions, sideScroll, addToast, removeToast, rotatePhrase, secondaryDetailLineCount } = ctx;

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
      handleFilterInput(input, key, {
        currentValue: state.filterString, setAction: 'SET_FILTER',
        clearToast: 'Filter cleared', dispatch, addToast,
      });
      return;
    }

    // Log filter overlay
    if (state.overlay === 'log-filter') {
      handleFilterInput(input, key, {
        currentValue: state.logFilterString, setAction: 'SET_LOG_FILTER',
        clearToast: 'Log filter cleared', dispatch, addToast,
        onTab: () => dispatch({ type: 'TOGGLE_LOG_FILTER_MODE' }),
      });
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
          executeAction(action, selectedItem, dispatch, addToast, removeToast);
          dispatch({ type: 'SET_OVERLAY', overlay: null });
        }
        return;
      }
      const match = contextActions.find(a => a.key === input);
      if (match && selectedItem) {
        executeAction(match, selectedItem, dispatch, addToast, removeToast);
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

    // Sort overlay
    if (state.overlay === 'sort') {
      if (key.escape) {
        dispatch({ type: 'SET_OVERLAY', overlay: null });
        return;
      }
      if (input === 'j' || key.downArrow) {
        dispatch({ type: 'SORT_MENU_NAV', delta: 1 });
        return;
      }
      if (input === 'k' || key.upArrow) {
        dispatch({ type: 'SORT_MENU_NAV', delta: -1 });
        return;
      }
      if (input === 'R') {
        dispatch({ type: 'TOGGLE_SORT_REVERSE' });
        addToast(`Sort: ${state.sortReversed ? 'ascending' : 'descending'}`, 'info');
        return;
      }
      if (key.return) {
        const field = SORT_FIELDS[state.sortMenuIndex];
        dispatch({ type: 'SET_SORT_FIELD', field });
        addToast(`Sort: ${field}`, 'info');
        return;
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
      const nextMode = state.layoutMode === 'normal' ? 'Wide' : state.layoutMode === 'wide' ? 'Expanded' : 'Normal';
      addToast(`Layout: ${nextMode}`, 'info');
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

    if (input === 'a' && panel.id === 'containers') {
      dispatch({ type: 'TOGGLE_SHOW_ALL' });
      addToast(state.showAllContainers ? 'Running only' : 'Show all', 'info');
      return;
    }

    if (input === 'o' && panel.id === 'containers') {
      dispatch({ type: 'SET_OVERLAY', overlay: 'sort' });
      return;
    }

    if (input === 'R' && panel.id === 'containers') {
      dispatch({ type: 'TOGGLE_SORT_REVERSE' });
      addToast(`Sort: ${state.sortReversed ? 'ascending' : 'descending'}`, 'info');
      return;
    }

    // Pin/unpin compare item
    if (input === 'm' && selectedItem && (panel.id === 'containers' || panel.id === 'services')) {
      const currentCompare = state.compareItemIds[panel.id] ?? null;
      if (currentCompare === selectedItem.id) {
        // Unpin
        dispatch({ type: 'PIN_COMPARE', panelId: panel.id, itemId: selectedItem.id });
        addToast('Unpinned comparison', 'info');
      } else {
        dispatch({ type: 'PIN_COMPARE', panelId: panel.id, itemId: selectedItem.id });
        const label = selectedItem.label.replace(/^[^\w]*/, '').trim();
        addToast(`Pinned ${label} for comparison`, 'info');
      }
      return;
    }

    if (input === 'x') {
      if (selectedItem && panelActions.length > 0) {
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
      // Shift+J/K: scroll secondary compare pane
      if (input === 'J' && secondaryDetailLineCount > 0) {
        dispatch({ type: 'SCROLL_SECONDARY_DETAIL_DELTA', delta: 1, totalLines: secondaryDetailLineCount, viewportHeight: detailViewportHeight });
        return;
      }
      if (input === 'K' && secondaryDetailLineCount > 0) {
        dispatch({ type: 'SCROLL_SECONDARY_DETAIL_DELTA', delta: -1, totalLines: secondaryDetailLineCount, viewportHeight: detailViewportHeight });
        return;
      }
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
      const actionMatch = panelActions.find(a => a.key === input && (!a.condition || a.condition(selectedItem)));
      if (actionMatch) {
        executeAction(actionMatch, selectedItem, dispatch, addToast, removeToast);
      }
    }
  });
}
