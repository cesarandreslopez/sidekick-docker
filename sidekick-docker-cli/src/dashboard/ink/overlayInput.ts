import type { Key } from 'ink';
import type { PanelAction, PanelItem } from '../panels/types';
import type { Action, DashboardUIState, OverlayKind, ToastSeverity } from './dashboardTypes';
import { SORT_FIELDS, sortFieldLabel, contextMenuCursor } from './dashboardTypes';
import { executeAction, findPanelAction } from './executeAction';
import { navigationRun, stripControlCharacters, tabRun } from './inputText';
import { sortDirectionLabel } from 'sidekick-docker-shared';


export interface OverlayInputContext {
  state: DashboardUIState;
  dispatch: (action: Action) => void;
  /** Condition-filtered actions shown in the context menu. */
  contextActions: PanelAction[];
  selectedItem: PanelItem | undefined;
  addToast: (message: string, severity: ToastSeverity, duration?: number) => number;
  removeToast: (id: number) => void;
  /** How far the help overlay can scroll at the current terminal size. */
  helpMaxScroll: number;
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
  // A pasted run of tabs: one mode toggle each, not tab characters in the query.
  const tabs = tabRun(input);
  if (tabs > 0) {
    if (onTab) for (let i = 0; i < tabs; i++) onTab();
    return;
  }
  if (key.backspace || key.delete) {
    dispatch({ type: setAction, value: currentValue.slice(0, -1) });
    return;
  }
  // Control characters (a pasted newline, tab or BEL) never belong in a
  // filter: they matched nothing and drew as garbage in the prompt.
  const text = key.ctrl || key.meta ? '' : stripControlCharacters(input);
  if (text) {
    dispatch({ type: setAction, value: currentValue + text });
  }
}

const confirm: OverlayInputHandler = (input, key, { state, dispatch }) => {
  // A chord is never an answer: Ctrl+Y / Alt+Y used to confirm a removal.
  const plain = !key.ctrl && !key.meta;
  if (plain && (input === 'y' || input === 'Y')) {
    state.confirmAction?.();
    dispatch({ type: 'SET_CONFIRM', action: null, message: '' });
    return;
  }
  // Enter is the safe default: cancel. q also cancels for consistency with other overlays.
  if ((plain && (input === 'n' || input === 'N' || input === 'q')) || key.escape || key.return) {
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
  const run = navigationRun(input);
  if (run !== 0) {
    dispatch({ type: 'CONTEXT_MENU_NAV', delta: run, keys: contextActions.map(a => a.key) });
    return;
  }
  if (input === 'j' || key.downArrow) {
    dispatch({ type: 'CONTEXT_MENU_NAV', delta: 1, keys: contextActions.map(a => a.key) });
    return;
  }
  if (input === 'k' || key.upArrow) {
    dispatch({ type: 'CONTEXT_MENU_NAV', delta: -1, keys: contextActions.map(a => a.key) });
    return;
  }
  if (key.return) {
    const action = contextActions[contextMenuCursor(contextActions, state.contextMenuKey)];
    if (action && selectedItem) {
      // Close the menu BEFORE executing: executeAction may open the confirm
      // overlay, which a later SET_OVERLAY:null would silently clobber.
      dispatch({ type: 'SET_OVERLAY', overlay: null });
      executeAction(action, selectedItem, dispatch, addToast, removeToast);
    }
    return;
  }
  // Same rule as outside the menu: Ctrl+R is not R(estart).
  const match = findPanelAction(contextActions, input, key);
  if (match && selectedItem) {
    dispatch({ type: 'SET_OVERLAY', overlay: null });
    executeAction(match, selectedItem, dispatch, addToast, removeToast);
  }
};

const help: OverlayInputHandler = (input, key, { dispatch, helpMaxScroll: max }) => {
  if (key.escape || input === '?' || input === 'q') {
    dispatch({ type: 'SET_OVERLAY', overlay: null });
    return;
  }
  const run = navigationRun(input);
  const delta = run !== 0 ? run
    : input === 'j' || key.downArrow ? 1
    : input === 'k' || key.upArrow ? -1
    : key.pageDown || (key.ctrl && input === 'd') ? 10
    : key.pageUp || (key.ctrl && input === 'u') ? -10
    : input === 'G' || key.end ? max
    : input === 'g' || key.home ? -max
    : 0;
  if (delta !== 0) dispatch({ type: 'HELP_SCROLL', delta, max });
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
  const run = navigationRun(input);
  if (run !== 0) {
    dispatch({ type: 'SORT_MENU_NAV', delta: run });
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
    // state is pre-toggle, so the new direction is the opposite one ("ascending"
    // was wrong for stats fields, whose default is highest first).
    addToast(`Sort: ${sortFieldLabel(state.sortField)}, ${sortDirectionLabel(state.sortField, !state.sortReversed)}`, 'info');
    return;
  }
  if (key.return) {
    const field = SORT_FIELDS[state.sortMenuIndex];
    dispatch({ type: 'SET_SORT_FIELD', field });
    addToast(`Sort: ${sortFieldLabel(field)}`, 'info');
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
