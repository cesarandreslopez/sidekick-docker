import type { Key } from 'ink';
import type { PanelAction, PanelItem } from '../panels/types';
import type { Action, DashboardUIState, OverlayKind, SortField, ToastSeverity } from './dashboardTypes';
import { executeAction } from './executeAction';

const SORT_FIELDS: SortField[] = ['state', 'name', 'cpu', 'mem', 'net', 'io', 'pids'];

export interface OverlayInputContext {
  state: DashboardUIState;
  dispatch: (action: Action) => void;
  /** Condition-filtered actions shown in the context menu. */
  contextActions: PanelAction[];
  selectedItem: PanelItem | undefined;
  addToast: (message: string, severity: ToastSeverity, duration?: number) => number;
  removeToast: (id: number) => void;
}

export type OverlayInputHandler = (input: string, key: Key, ctx: OverlayInputContext) => void;

/** Handle keyboard input for a text filter overlay (panel filter or log filter). */
function handleFilterInput(
  input: string,
  key: Key,
  opts: {
    currentValue: string;
    setAction: 'SET_FILTER' | 'SET_LOG_FILTER';
    clearToast?: string;
    dispatch: (action: Action) => void;
    addToast: (message: string, severity: ToastSeverity, duration?: number) => number;
    onTab?: () => void;
  },
): void {
  const { currentValue, setAction, clearToast, dispatch, addToast, onTab } = opts;
  if (key.escape) {
    if (currentValue && clearToast) addToast(clearToast, 'info');
    dispatch({ type: setAction, value: '' });
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
    dispatch({ type: setAction, value: currentValue.slice(0, -1) });
    return;
  }
  if (input && !key.ctrl && !key.meta) {
    dispatch({ type: setAction, value: currentValue + input });
  }
}

const confirm: OverlayInputHandler = (input, key, { state, dispatch }) => {
  if (input === 'y' || input === 'Y') {
    state.confirmAction?.();
    dispatch({ type: 'SET_CONFIRM', action: null, message: '' });
    return;
  }
  // Enter is the safe default: cancel. q also cancels for consistency with other overlays.
  if (input === 'n' || input === 'N' || input === 'q' || key.escape || key.return) {
    dispatch({ type: 'SET_CONFIRM', action: null, message: '' });
  }
};

const filter: OverlayInputHandler = (input, key, { state, dispatch, addToast }) => {
  handleFilterInput(input, key, {
    currentValue: state.filterString, setAction: 'SET_FILTER',
    clearToast: 'Filter cleared', dispatch, addToast,
  });
};

const logFilter: OverlayInputHandler = (input, key, { state, dispatch, addToast }) => {
  handleFilterInput(input, key, {
    currentValue: state.logFilterString, setAction: 'SET_LOG_FILTER',
    clearToast: 'Log filter cleared', dispatch, addToast,
    onTab: () => dispatch({ type: 'TOGGLE_LOG_FILTER_MODE' }),
  });
};

const contextMenu: OverlayInputHandler = (input, key, ctx) => {
  const { state, dispatch, contextActions, selectedItem, addToast, removeToast } = ctx;
  if (key.escape || input === 'q') {
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
};

const help: OverlayInputHandler = (input, key, { dispatch }) => {
  if (key.escape || input === '?' || input === 'q') {
    dispatch({ type: 'SET_OVERLAY', overlay: null });
  }
};

const version: OverlayInputHandler = (input, key, { dispatch }) => {
  if (key.escape || input === 'V' || input === 'q') {
    dispatch({ type: 'SET_OVERLAY', overlay: null });
  }
};

const sort: OverlayInputHandler = (input, key, { state, dispatch, addToast }) => {
  if (key.escape || input === 'q') {
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
  }
};

/** Per-overlay input handlers. The exec overlay bypasses useInput entirely (raw PTY passthrough). */
export const OVERLAY_INPUT_HANDLERS: Record<Exclude<OverlayKind, null>, OverlayInputHandler> = {
  confirm,
  filter,
  'log-filter': logFilter,
  'context-menu': contextMenu,
  help,
  version,
  sort,
  exec: () => {},
};
