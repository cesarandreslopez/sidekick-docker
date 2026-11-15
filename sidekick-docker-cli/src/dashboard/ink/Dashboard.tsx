import React, { useReducer, useCallback, useEffect, useRef } from 'react';
import { Box, useApp } from 'ink';
import type { DockerDashboardMetrics } from '../DockerState';
import type { SidePanel } from '../panels/types';
import { itemName } from '../panels/types';
import { useTerminalSize } from './useTerminalSize';
import { useWindowedScroll } from './useWindowedScroll';
import { useKeyboardHandler } from './useKeyboardHandler';
import { useMouseHandler } from './useMouseHandler';
import { TabBar } from './TabBar';
import { SideList } from './SideList';
import { DetailTabBar } from './DetailTabBar';
import { DetailPane } from './DetailPane';
import { CompareDetailPane } from './CompareDetailPane';
import { StatusBar } from './StatusBar';
import type { ActionHint } from './StatusBar';
import { HelpOverlay } from './HelpOverlay';
import { FilterOverlay } from './FilterOverlay';
import { ContextMenuOverlay } from './ContextMenuOverlay';
import { ConfirmOverlay } from './ConfirmOverlay';
import { ToastStack } from './ToastStack';
import { TooSmallOverlay } from './TooSmallOverlay';
import { ExecOverlay } from './ExecOverlay';
import { MouseProvider } from './mouse';
import { LogFilterOverlay } from './LogFilterOverlay';
import { VersionOverlay } from './VersionOverlay';
import { SortOverlay } from './SortOverlay';
import { getRandomPhrase, matchesRunningOnly } from 'sidekick-docker-shared';
import type { ContainerInfo } from 'sidekick-docker-shared';
import { ExecManager } from '../ExecManager';
import { stripCursorEscapes, renderLogLines } from '../../formatters';
import type { LayoutMode, DashboardUIState, Action, SortField } from './dashboardTypes';
import { SORT_FIELDS } from './dashboardTypes';
import { buildHelpBindings, buildContextHint } from './keyRegistry';
import type { KeyContext, KeyQueryContext } from './keyRegistry';
import { maxScrollOffset } from './windowLines';
import { appendExecOutput, ExecOutputBuffer, isDetachKey } from './execOutput';
import { buildHelpSections, layoutHelp } from './helpLayout';
import { toastDuration } from './toastLayout';
import { orderItems, resolveSelection, isPinGone } from './listModel';
import { detailTabSuffix } from './tabLayout';
import { contextMenuTitle } from './overlayHitTest';
import { DEFAULT_EXEC_SHELL, describeExecExit } from '../execShell';


declare const __CLI_VERSION__: string;

const SIDE_PANEL_WIDTH = 28;
const SIDE_PANEL_WIDTH_WIDE = 42;
const MIN_SCREEN_WIDTH = 60;
const MIN_SCREEN_HEIGHT = 15;
const RESERVED_UI_ROWS = 5;
const MAX_QUEUED_TOASTS = 5;
const PHRASE_ROTATE_MS = 7000;

export function reducer(state: DashboardUIState, action: Action): DashboardUIState {
  switch (action.type) {
    case 'SWITCH_PANEL':
      return {
        ...state,
        activePanelIndex: action.index,
        selectedItemIndex: 0,
        selectedItemId: null,
        detailTabIndex: 0,
        filterString: '',
        focusTarget: 'side',
        overlay: null,
        detailScrollOffset: 0,
        detailScrollPerTab: {},
        logFollow: true,
      };
    // Keeps detailTabIndex: moving through the list used to snap the detail
    // pane back to Logs, so comparing two containers' Stats or Config meant
    // re-selecting the tab for every row.
    case 'SELECT_ITEM':
      return {
        ...state,
        selectedItemIndex: action.index,
        // Unknown id: resolveSelection records the row's id on the next render.
        selectedItemId: action.id ?? null,
        detailScrollOffset: 0,
        detailScrollPerTab: {},
        secondaryDetailScrollOffset: 0,
        secondaryFollow: true,
        logFollow: true,
      };
    // The list changed under the selection (refresh, sort, filter): follow the
    // item without the scroll/follow reset a user's selection change gets.
    case 'RESOLVE_SELECTION':
      return { ...state, selectedItemIndex: action.index, selectedItemId: action.id };
    case 'SET_DETAIL_TAB': {
      const saved = { ...state.detailScrollPerTab, [state.detailTabIndex]: state.detailScrollOffset };
      return { ...state, detailTabIndex: action.index, detailScrollOffset: saved[action.index] ?? 0, detailScrollPerTab: saved, logFollow: true };
    }
    case 'CYCLE_DETAIL_TAB': {
      if (action.tabCount <= 1) return state;
      const next = (state.detailTabIndex + action.direction + action.tabCount) % action.tabCount;
      const saved = { ...state.detailScrollPerTab, [state.detailTabIndex]: state.detailScrollOffset };
      return { ...state, detailTabIndex: next, detailScrollOffset: saved[next] ?? 0, detailScrollPerTab: saved, logFollow: true };
    }
    case 'CYCLE_LAYOUT': {
      const next: LayoutMode = state.layoutMode === 'normal' ? 'wide' : state.layoutMode === 'wide' ? 'expanded' : 'normal';
      return { ...state, layoutMode: next, focusTarget: next === 'expanded' ? 'detail' : state.focusTarget };
    }
    // Expanded hides the list, so focus stays on the detail pane: moving it to
    // the invisible list made j/k change the item with nothing on screen
    // saying so.
    case 'TOGGLE_FOCUS':
      if (state.layoutMode === 'expanded') return state;
      return { ...state, focusTarget: state.focusTarget === 'side' ? 'detail' : 'side' };
    case 'SET_FOCUS':
      if (state.layoutMode === 'expanded' && action.target === 'side') return state;
      return { ...state, focusTarget: action.target };
    case 'SET_OVERLAY':
      return {
        ...state,
        overlay: action.overlay,
        contextMenuIndex: 0,
        helpScroll: 0,
        // The sort menu opens on the current field, not wherever its cursor was left.
        sortMenuIndex: action.overlay === 'sort' ? Math.max(0, SORT_FIELDS.indexOf(state.sortField)) : state.sortMenuIndex,
      };
    case 'HELP_SCROLL':
      return { ...state, helpScroll: Math.max(0, Math.min(state.helpScroll + action.delta, action.max)) };
    case 'SET_FILTER':
      return { ...state, filterString: action.value };
    case 'SCROLL_DETAIL': {
      // followTab marks a user-initiated scroll on a logs (auto-scroll) tab:
      // follow pauses unless the jump lands at the bottom.
      if (action.followTab && action.totalLines !== undefined && action.viewportHeight !== undefined) {
        const maxOffset = maxScrollOffset(action.totalLines, action.viewportHeight);
        return { ...state, detailScrollOffset: action.offset, logFollow: action.offset >= maxOffset };
      }
      return { ...state, detailScrollOffset: action.offset };
    }
    case 'SCROLL_DETAIL_DELTA': {
      const maxOffset = maxScrollOffset(action.totalLines, action.viewportHeight);
      const next = Math.max(0, Math.min(state.detailScrollOffset + action.delta, maxOffset));
      if (action.followTab) {
        return { ...state, detailScrollOffset: next, logFollow: next >= maxOffset };
      }
      return { ...state, detailScrollOffset: next };
    }
    case 'ADD_TOAST':
      return { ...state, toasts: [...state.toasts, action.toast].slice(-MAX_QUEUED_TOASTS) };
    case 'REMOVE_TOAST':
      return { ...state, toasts: state.toasts.filter(t => t.id !== action.id) };
    case 'CONTEXT_MENU_NAV': {
      if (action.itemCount === 0) return state;
      const next = (state.contextMenuIndex + action.delta + action.itemCount) % action.itemCount;
      return { ...state, contextMenuIndex: next };
    }
    case 'SCROLL_SIDE': {
      if (action.itemCount === 0) return state;
      const next = Math.max(0, Math.min(state.selectedItemIndex + action.delta, action.itemCount - 1));
      // A selection change like SELECT_ITEM: every detail offset belongs to the old item.
      return {
        ...state,
        selectedItemIndex: next,
        selectedItemId: null,
        detailScrollOffset: 0,
        detailScrollPerTab: {},
        secondaryDetailScrollOffset: 0,
        secondaryFollow: true,
        logFollow: true,
      };
    }
    case 'SET_CONFIRM':
      return { ...state, confirmAction: action.action, confirmMessage: action.message, confirmSeverity: action.severity ?? 'high', overlay: action.action ? 'confirm' : null };
    case 'EXEC_START':
      return { ...state, overlay: 'exec', execContainerId: action.containerId, execContainerName: action.containerName, execOutputLines: [] };
    case 'EXEC_APPEND_OUTPUT':
      return { ...state, execOutputLines: appendExecOutput(state.execOutputLines, action.data) };
    case 'EXEC_END':
      return { ...state, overlay: null, execContainerId: null, execContainerName: '', execOutputLines: [] };
    case 'SET_LOG_FILTER':
      return { ...state, logFilterString: action.value };
    case 'TOGGLE_LOG_FILTER_MODE':
      return { ...state, logFilterMode: state.logFilterMode === 'exact' ? 'fuzzy' : 'exact' };
    case 'TOGGLE_SHOW_ALL':
      return { ...state, showAllContainers: !state.showAllContainers, selectedItemIndex: 0, selectedItemId: null };
    case 'SET_SORT_FIELD':
      return { ...state, sortField: action.field, overlay: null };
    case 'TOGGLE_SORT_REVERSE':
      return { ...state, sortReversed: !state.sortReversed };
    case 'SORT_MENU_NAV': {
      const next = (state.sortMenuIndex + action.delta + SORT_FIELDS.length) % SORT_FIELDS.length;
      return { ...state, sortMenuIndex: next };
    }
    case 'PIN_COMPARE': {
      const current = state.compareItemIds[action.panelId] ?? null;
      const newId = current === action.itemId ? null : action.itemId;
      return {
        ...state,
        compareItemIds: { ...state.compareItemIds, [action.panelId]: newId },
        secondaryDetailScrollOffset: 0,
        secondaryFollow: true,
      };
    }
    case 'CLEAR_COMPARE':
      return {
        ...state,
        compareItemIds: { ...state.compareItemIds, [action.panelId]: null },
        secondaryDetailScrollOffset: 0,
        secondaryFollow: true,
      };
    case 'SCROLL_SECONDARY_DETAIL':
      return { ...state, secondaryDetailScrollOffset: action.offset };
    case 'SCROLL_SECONDARY_DETAIL_DELTA': {
      // J/K: scrolling up pauses the compare pane's own follow; reaching the bottom resumes it.
      const maxOffset = maxScrollOffset(action.totalLines, action.viewportHeight);
      const base = Math.min(state.secondaryDetailScrollOffset, maxOffset);
      const next = Math.max(0, Math.min(base + action.delta, maxOffset));
      return { ...state, secondaryDetailScrollOffset: next, secondaryFollow: next >= maxOffset };
    }
    case 'RESUME_SECONDARY_FOLLOW':
      return { ...state, secondaryFollow: true };
    case 'TOGGLE_MOUSE':
      return { ...state, mouseEnabled: !state.mouseEnabled };
    default:
      return state;
  }
}

export const initialState: DashboardUIState = {
  activePanelIndex: 0,
  selectedItemIndex: 0,
  selectedItemId: null,
  detailTabIndex: 0,
  layoutMode: 'normal',
  focusTarget: 'side',
  overlay: null,
  filterString: '',
  detailScrollOffset: 0,
  detailScrollPerTab: {},
  toasts: [],
  contextMenuIndex: 0,
  confirmAction: null,
  confirmMessage: '',
  confirmSeverity: 'high' as const,
  execOutputLines: [],
  execContainerId: null,
  execContainerName: '',
  logFilterString: '',
  logFilterMode: 'exact',
  logFollow: true,
  showAllContainers: true,
  sortField: 'state' as SortField,
  sortReversed: false,
  sortMenuIndex: 0,
  compareItemIds: {},
  secondaryDetailScrollOffset: 0,
  secondaryFollow: true,
  helpScroll: 0,
  mouseEnabled: true,
};

interface DashboardProps {
  panels: SidePanel[];
  metrics: DockerDashboardMetrics;
  onViewStateChange?: (viewState: DashboardViewState) => void;
  execTriggerRef?: React.RefObject<((containerId: string, containerName: string) => void) | null>;
  onExecFallback?: (containerId: string, containerName: string) => Promise<void>;
  /** Shell to run for Exec (`--shell` / SIDEKICK_DOCKER_SHELL). */
  execShell?: string;
  /** Endpoint overrides for the spawned `docker exec` process (see `dockerCliEnv`). */
  dockerEnv?: Record<string, string>;
  /** Re-fetch everything now; resolves with the resources that could not be refreshed. */
  onRefresh?: () => Promise<string[]>;
  /** Initial mouse capture (false for --no-mouse); M toggles it at runtime. */
  mouse?: boolean;
}

export interface DashboardViewState {
  panelId: string;
  itemId: string | null;
  detailTabIndex: number;
  sortField: SortField;
  compareItemId: string | null;
}

export function Dashboard({ panels, metrics, onViewStateChange, execTriggerRef, onExecFallback, dockerEnv, onRefresh, execShell = DEFAULT_EXEC_SHELL, mouse = true }: DashboardProps): React.ReactElement {
  const [state, dispatch] = useReducer(reducer, mouse, (enabled): DashboardUIState => ({ ...initialState, mouseEnabled: enabled }));
  const { columns, rows } = useTerminalSize();
  const { exit, suspendTerminal } = useApp();
  const toastIdRef = useRef(0);
  const execManagerRef = useRef<ExecManager | null>(null);
  const execInFallbackRef = useRef(false);
  const execInputHandlerRef = useRef<((data: Buffer) => void) | null>(null);

  // Rotating phrase in the tab bar. The timer chain lives entirely inside the
  // effect: re-assigning a ref during render is not safe under React 19.
  const [phrase, setPhrase] = React.useState(() => getRandomPhrase());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = (): void => {
      setPhrase(getRandomPhrase());
      timer = setTimeout(tick, PHRASE_ROTATE_MS);
    };
    timer = setTimeout(tick, PHRASE_ROTATE_MS);
    return () => { clearTimeout(timer); };
  }, []);

  // Forward raw stdin to PTY when exec overlay is active
  useEffect(() => {
    if (state.overlay !== 'exec' || execInFallbackRef.current) return;
    const handler = (data: Buffer | string) => {
      // Ink sets stdin to utf8, so this arrives as a string: comparing
      // data[0] to the number 0x1d never matched, and Ctrl+] never detached.
      if (isDetachKey(data)) {
        execManagerRef.current?.dispose();
        execManagerRef.current = null;
        dispatch({ type: 'EXEC_END' });
        return;
      }
      execManagerRef.current?.write(data.toString());
    };
    execInputHandlerRef.current = handler;
    process.stdin.on('data', handler);
    return () => {
      process.stdin.removeListener('data', handler);
      execInputHandlerRef.current = null;
    };
  }, [state.overlay]);

  // Resize PTY when terminal size changes
  useEffect(() => {
    if (state.overlay === 'exec' && execManagerRef.current) {
      execManagerRef.current.resize(columns, rows);
    }
  }, [columns, rows, state.overlay]);

  const addToast = useCallback((message: string, severity: 'error' | 'warning' | 'info' | 'success', duration?: number, opts?: { progress?: boolean }) => {
    const id = ++toastIdRef.current;
    const progress = opts?.progress ?? false;
    dispatch({ type: 'ADD_TOAST', toast: { id, message, severity, progress } });
    if (!progress) {
      // Progress toasts persist until the action settles (removed explicitly).
      const dur = toastDuration(severity, message, duration);
      setTimeout(() => dispatch({ type: 'REMOVE_TOAST', id }), dur);
    }
    return id;
  }, []);

  const removeToast = useCallback((id: number) => {
    dispatch({ type: 'REMOVE_TOAST', id });
  }, []);

  // Populate exec trigger ref so external code can start exec sessions
  useEffect(() => {
    if (!execTriggerRef) return;
    execTriggerRef.current = (containerId: string, containerName: string) => {
      if (execManagerRef.current) return;
      const manager = new ExecManager();
      execManagerRef.current = manager;
      const output = new ExecOutputBuffer(data => dispatch({ type: 'EXEC_APPEND_OUTPUT', data }));
      // The last bit of output explains an immediate exit (e.g. "stat /bin/sh: no such file").
      let outputTail = '';

      dispatch({ type: 'EXEC_START', containerId, containerName });

      manager.start({
        containerId,
        containerName,
        cols: columns,
        rows,
        env: dockerEnv,
        shell: execShell,
        onData: (data) => {
          const cleaned = stripCursorEscapes(data);
          outputTail = (outputTail + cleaned).slice(-512);
          output.push(cleaned);
        },
        onExit: (exitCode) => {
          output.clear();
          execManagerRef.current?.dispose();
          execManagerRef.current = null;
          dispatch({ type: 'EXEC_END' });
          const reason = describeExecExit({ exitCode, outputTail, shell: execShell, containerName });
          if (reason) addToast(reason, 'error');
        },
      }).then(async (started) => {
        if (!started && execManagerRef.current === manager) {
          try {
            if (!onExecFallback) throw new Error('Interactive exec is unavailable.');
            execInFallbackRef.current = true;
            // The embedded PTY input listener must release stdin to the child too.
            if (execInputHandlerRef.current) process.stdin.removeListener('data', execInputHandlerRef.current);
            await suspendTerminal(() => onExecFallback(containerId, containerName));
          } finally {
            execInFallbackRef.current = false;
            manager.dispose();
            execManagerRef.current = null;
            dispatch({ type: 'EXEC_END' });
          }
        }
      }).catch((error: unknown) => {
        output.clear();
        manager.dispose();
        execManagerRef.current = null;
        dispatch({ type: 'EXEC_END' });
        addToast(error instanceof Error ? error.message : String(error), 'error');
      });
    };
    return () => { execTriggerRef.current = null; };
  }, [execTriggerRef, onExecFallback, columns, rows, dockerEnv, execShell, suspendTerminal, addToast]);

  useEffect(() => () => {
    execManagerRef.current?.dispose();
    execManagerRef.current = null;
  }, []);

  // Derived values
  const panel = panels[state.activePanelIndex];
  const tooSmall = columns < MIN_SCREEN_WIDTH || rows < MIN_SCREEN_HEIGHT;
  // Wide layout adapts to narrow terminals instead of starving the detail pane.
  const wideWidth = Math.min(SIDE_PANEL_WIDTH_WIDE, Math.max(SIDE_PANEL_WIDTH, Math.floor(columns * 0.4)));
  const sideWidth = state.layoutMode === 'expanded' ? 0
    : state.layoutMode === 'wide' ? wideWidth
    : SIDE_PANEL_WIDTH;
  const listState: 'disconnected' | 'loading' | 'ready' = !metrics.daemonConnected
    ? 'disconnected'
    : metrics.lastRefresh == null ? 'loading' : 'ready';

  // Merge log filter UI state into metrics. Panels receive this everywhere —
  // getItems as well as tab renders — so actions such as Copy Logs see the
  // same filter the Logs tab shows (they used to see an always-empty one).
  const enrichedMetrics = React.useMemo(() => ({
    ...metrics,
    logFilterString: state.logFilterString,
    logFilterMode: state.logFilterMode,
  }), [metrics, state.logFilterString, state.logFilterMode]);

  // Items for the active panel: filtered + sorted, memoized so UI-only renders
  // (toasts, scroll, phrase) don't refilter/resort. metrics identity changes on
  // every data refresh, which is exactly when recomputation is needed.
  const { allItems, currentItems, totalItemCount, hiddenByRunningOnly } = React.useMemo(() => {
    const unfiltered = panel.getItems(enrichedMetrics);
    const total = unfiltered.length;
    let items = unfiltered;
    // Show all / running-only toggle (containers panel)
    if (panel.id === 'containers' && !state.showAllContainers) {
      items = items.filter(it => matchesRunningOnly((it.data as ContainerInfo).state));
    }
    const hidden = total - items.length;
    if (state.filterString) {
      const f = state.filterString.toLowerCase();
      items = items.filter(it => {
        const text = panel.getSearchableText?.(it) ?? it.label;
        return text.toLowerCase().includes(f);
      });
    }
    const ordered = orderItems(items, {
      panelId: panel.id,
      sortField: state.sortField,
      sortReversed: state.sortReversed,
      stats: metrics.statsCollector,
    });
    return { allItems: unfiltered, currentItems: ordered, totalItemCount: total, hiddenByRunningOnly: hidden };
  }, [panel, metrics, enrichedMetrics, state.showAllContainers, state.filterString, state.sortField, state.sortReversed]);

  // Keep the selection on the same item when the list reorders or shrinks.
  // If the item is gone, its neighbour is a fresh selection (SELECT_ITEM
  // resets the old item's scroll and paused follow).
  const resolved = resolveSelection(currentItems, state.selectedItemIndex, state.selectedItemId);
  if (currentItems.length > 0 && (resolved.index !== state.selectedItemIndex || resolved.id !== state.selectedItemId)) {
    dispatch(resolved.replaced
      ? { type: 'SELECT_ITEM', index: resolved.index, id: resolved.id }
      : { type: 'RESOLVE_SELECTION', index: resolved.index, id: resolved.id });
  }
  const clampedSelection = Math.min(resolved.index, Math.max(0, currentItems.length - 1));

  const sideViewportHeight = Math.max(1, rows - RESERVED_UI_ROWS);
  const sideScroll = useWindowedScroll({ totalItems: currentItems.length, viewportHeight: sideViewportHeight });

  useEffect(() => {
    if (sideScroll.selectedIndex !== state.selectedItemIndex) {
      sideScroll.setSelected(state.selectedItemIndex);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.selectedItemIndex]);

  const selectedItem = currentItems[clampedSelection];

  const detailTabs = panel.detailTabs;
  const tabIdx = Math.min(state.detailTabIndex, detailTabs.length - 1);

  const compareItemId = state.compareItemIds[panel.id] ?? null;
  // Pinning the selected item and moving on is how compare starts, so the pin
  // must survive selecting it again (that just shows one pane): it used to be
  // auto-cleared right away, and compare never turned on.
  const comparedItemId = compareItemId !== null && compareItemId !== selectedItem?.id ? compareItemId : null;

  // Drop the pin only once the pinned item is really gone.
  const pinGone = isPinGone(compareItemId, allItems, listState);
  useEffect(() => {
    if (pinGone) dispatch({ type: 'CLEAR_COMPARE', panelId: panel.id });
  }, [pinGone, panel.id]);

  useEffect(() => {
    onViewStateChange?.({
      panelId: panel.id,
      itemId: selectedItem?.id ?? null,
      detailTabIndex: tabIdx,
      sortField: state.sortField,
      // Null while the pinned item is the selected one: no second stream of it.
      compareItemId: comparedItemId,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel.id, selectedItem?.id, tabIdx, state.sortField, comparedItemId]);

  let detailLines: string[] = [];
  if (selectedItem && detailTabs.length > 0 && tabIdx >= 0) {
    const result = detailTabs[tabIdx].render(selectedItem, enrichedMetrics);
    detailLines = Array.isArray(result) ? result : result.split('\n');
  } else if (!selectedItem) {
    detailLines = ['(no item selected)'];
  }
  const detailViewportHeight = Math.max(1, rows - RESERVED_UI_ROWS);

  // Auto-scroll to bottom when the active tab requests it (e.g. Logs),
  // unless the user paused following by scrolling up.
  const activeTab = detailTabs[tabIdx];
  const shouldAutoScroll = activeTab?.autoScrollBottom ?? false;
  const followPaused = shouldAutoScroll && !state.logFollow;

  // Compare mode spends one viewport row on its column-header; every scroll
  // clamp must budget it or the newest lines become unreachable.
  const isCompareActive = comparedItemId != null && shouldAutoScroll;
  const scrollViewportHeight = isCompareActive ? Math.max(1, detailViewportHeight - 1) : detailViewportHeight;

  // Follow the tail — including back *up* when the content shrinks. Switching
  // items renders one frame with the previous item's (long) log before the new
  // buffer arrives; following only when the content was taller than the
  // viewport left the offset at the old bottom, and a short log rendered as
  // "▲ (67 more)" above an empty pane.
  const followOffset = maxScrollOffset(detailLines.length, scrollViewportHeight);
  useEffect(() => {
    if (shouldAutoScroll && state.logFollow && state.detailScrollOffset !== followOffset) {
      dispatch({ type: 'SCROLL_DETAIL', offset: followOffset });
    }
  }, [shouldAutoScroll, state.logFollow, state.detailScrollOffset, followOffset]);
  // Never render past the end, whatever the stored offset.
  const detailOffset = Math.min(state.detailScrollOffset, followOffset);
  const secondaryDetailLines = React.useMemo(() => {
    if (!isCompareActive) return [];
    if (panel.id === 'containers') {
      const logs = enrichedMetrics.secondaryContainerLogs;
      if (logs.length === 0) return ['Waiting for logs...'];
      return renderLogLines(logs, state.logFilterString, state.logFilterMode, enrichedMetrics.secondaryLogSeverityCounts);
    }
    if (panel.id === 'services') {
      const logs = enrichedMetrics.secondaryComposeLogs;
      if (logs.length === 0) return ['Waiting for logs...'];
      return renderLogLines(logs, state.logFilterString, state.logFilterMode);
    }
    return [];
  }, [isCompareActive, panel.id, enrichedMetrics.secondaryContainerLogs, enrichedMetrics.secondaryComposeLogs, enrichedMetrics.secondaryLogSeverityCounts, state.logFilterString, state.logFilterMode]);

  // The compare pane tails on its own flag (K pauses it, J to the bottom
  // resumes), compared against the target like the primary — re-running only
  // on a length change left it at the top after SELECT_ITEM zeroed it.
  const secondaryFollowOffset = maxScrollOffset(secondaryDetailLines.length, scrollViewportHeight);
  useEffect(() => {
    if (isCompareActive && state.secondaryFollow && state.secondaryDetailScrollOffset !== secondaryFollowOffset) {
      dispatch({ type: 'SCROLL_SECONDARY_DETAIL', offset: secondaryFollowOffset });
    }
  }, [isCompareActive, state.secondaryFollow, state.secondaryDetailScrollOffset, secondaryFollowOffset]);
  const secondaryOffset = Math.min(state.secondaryDetailScrollOffset, secondaryFollowOffset);

  // The compare item's name for the pane header — from the unfiltered list,
  // so a filter or the running-only toggle cannot turn it into a bare id.
  const compareItemLabel = React.useMemo(() => {
    if (!comparedItemId) return '';
    const item = allItems.find(it => it.id === comparedItemId);
    return item ? itemName(item) : comparedItemId.slice(0, 12);
  }, [comparedItemId, allItems]);

  // Panel actions — computed once, used by context menu, keyboard handler, and status bar
  const panelActions = panel.getActions();
  const applicableActions = selectedItem
    ? panelActions.filter(a => !a.condition || a.condition(selectedItem))
    : [];
  const contextActions = state.overlay === 'context-menu' ? applicableActions : [];

  // Compute per-panel item counts for TabBar badges (memoized: only data
  // refreshes change them, not UI-state renders)
  const runningCount = metrics.containers.filter(c => c.state === 'running').length;
  const panelCounts = React.useMemo(() => panels.map((p) => {
    if (p.id === 'containers') {
      return { total: metrics.containers.length, running: runningCount };
    }
    if (p.id === 'services') {
      const meaningful = metrics.composeProjects.reduce((sum, proj) => sum + proj.services.length, 0);
      return { total: meaningful };
    }
    return { total: p.getItems(enrichedMetrics).length };
  }), [panels, metrics, enrichedMetrics, runningCount]);

  // The detail strip's trailing text; the mouse handler windows the tabs with the same one.
  const detailSuffix = detailTabSuffix({
    followPaused,
    itemName: state.layoutMode === 'expanded' && selectedItem ? itemName(selectedItem) : undefined,
    paneWidth: columns - sideWidth,
    tabLabels: detailTabs.map(t => t.label),
  });
  const menuTitle = contextMenuTitle(selectedItem ? itemName(selectedItem) : undefined);

  // Read-only slice: safe to consume during render (help overlay, status hints).
  const keyQueryCtx: KeyQueryContext = {
    state, panel, selectedItem, applicableActions, detailTabs, tabIdx,
    secondaryDetailLineCount: secondaryDetailLines.length,
  };

  // The help overlay is laid out to fit (two columns when wide, scrolling when tall).
  const helpLayout = state.overlay === 'help'
    ? layoutHelp(buildHelpSections(buildHelpBindings(keyQueryCtx), panel.getActions(), panel.title), rows, columns, state.helpScroll)
    : null;
  const helpMaxScroll = helpLayout?.maxScroll ?? 0;

  // Mouse input (extracted hook)
  const handleMouse = useMouseHandler({
    state, dispatch, panels, panelCounts, currentItems, clampedSelection,
    selectedItem, applicableActions, sideWidth, sideViewportHeight, sideScroll, detailLines,
    detailViewportHeight: scrollViewportHeight, detailTabs, tabIdx, rows, columns, addToast, removeToast,
    detailSuffix, menuTitle, helpMaxScroll,
  });

  // Full context for key handlers — adds dispatch/addToast/exit, which close
  // over refs and must therefore never reach a render-time call.
  const refresh = useCallback(() => {
    if (!onRefresh) return;
    const id = addToast('Refreshing…', 'info', undefined, { progress: true });
    onRefresh().then((failed) => {
      removeToast(id);
      if (failed.length) addToast(`Refreshed — ${failed.join(', ')} unavailable`, 'warning');
      else addToast('Refreshed', 'success', 1500);
    }, (err: unknown) => {
      removeToast(id);
      addToast(`Refresh failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
    });
  }, [onRefresh, addToast, removeToast]);

  const keyCtx: KeyContext = {
    ...keyQueryCtx,
    dispatch, panels, clampedSelection, currentItems, detailLines,
    detailViewportHeight: scrollViewportHeight, sideScroll, addToast, exit, refresh,
    helpMaxScroll,
  };

  // Keyboard input (extracted hook)
  useKeyboardHandler({ ctx: keyCtx, removeToast });

  // Right-click/x can request the menu for an item with no applicable actions;
  // close it instead of showing an empty shell.
  useEffect(() => {
    if (state.overlay === 'context-menu' && (!selectedItem || applicableActions.length === 0)) {
      dispatch({ type: 'SET_OVERLAY', overlay: null });
    }
  }, [state.overlay, selectedItem, applicableActions.length]);

  // Render
  if (tooSmall) {
    return <TooSmallOverlay columns={columns} rows={rows} />;
  }

  const showNormalLayout = state.overlay !== 'help' && state.overlay !== 'exec' && state.overlay !== 'version';

  // Panel action hints for status bar — compact summary, not full action list
  const panelActionHints: ActionHint[] = applicableActions.length > 0
    ? [{ key: 'x', label: 'Actions', destructive: false }]
    : [];

  // Contextual hints derived from the key registry (single source of truth)
  const contextHint = buildContextHint(keyQueryCtx);

  return (
    <MouseProvider onMouse={handleMouse} enabled={state.overlay !== 'exec' && state.mouseEnabled}>
      <Box flexDirection="column" height={rows} width={columns}>
        {showNormalLayout && (
          <TabBar panels={panels} activeIndex={state.activePanelIndex} layoutMode={state.layoutMode} phrase={phrase} panelCounts={panelCounts} width={columns} />
        )}

        {showNormalLayout && (
          <Box flexGrow={1} flexDirection="row">
            {sideWidth > 0 && (
              <SideList
                items={currentItems}
                selectedIndex={clampedSelection}
                scrollOffset={sideScroll.scrollOffset}
                focused={state.focusTarget === 'side'}
                width={sideWidth}
                viewportHeight={sideViewportHeight}
                panelTitle={panel.title}
                filterString={state.filterString || undefined}
                panelId={panel.id}
                // Services counts service rows only, as its tab does (not project headers).
                totalCount={panel.id === 'services' ? panelCounts[state.activePanelIndex].total : totalItemCount}
                runningCount={panel.id === 'containers' ? runningCount : undefined}
                compareItemId={compareItemId || undefined}
                listState={listState}
                hiddenByRunningOnly={hiddenByRunningOnly}
              />
            )}
            <Box flexDirection="column" flexGrow={1}>
              <DetailTabBar tabs={detailTabs} activeIndex={tabIdx} suffix={detailSuffix} width={columns - sideWidth} />
              {isCompareActive ? (
                <CompareDetailPane
                  primaryLines={detailLines}
                  secondaryLines={secondaryDetailLines}
                  primaryScrollOffset={detailOffset}
                  secondaryScrollOffset={secondaryOffset}
                  viewportHeight={scrollViewportHeight}
                  totalWidth={columns - sideWidth}
                  focused={state.focusTarget === 'detail'}
                  primaryLabel={selectedItem ? itemName(selectedItem) : ''}
                  secondaryLabel={compareItemLabel}
                  followPaused={followPaused}
                  secondaryPaused={!state.secondaryFollow}
                />
              ) : (
                <DetailPane
                  lines={detailLines}
                  scrollOffset={detailOffset}
                  viewportHeight={detailViewportHeight}
                  focused={state.focusTarget === 'detail'}
                  followPaused={followPaused}
                />
              )}
            </Box>
          </Box>
        )}

        {helpLayout && (
          <HelpOverlay version={__CLI_VERSION__} layout={helpLayout} mouseEnabled={state.mouseEnabled} />
        )}

        {state.overlay === 'version' && (
          <VersionOverlay version={__CLI_VERSION__} />
        )}

        {state.overlay === 'exec' && (
          <ExecOverlay
            containerName={state.execContainerName}
            outputLines={state.execOutputLines}
          />
        )}

        {state.overlay !== 'exec' && (
          <StatusBar
            daemonConnected={metrics.daemonConnected}
            resourceErrors={metrics.resourceErrors}
            focusTarget={state.focusTarget}
            panelActionHints={panelActionHints}
            filterString={state.filterString}
            containerCount={metrics.containers.length}
            runningCount={runningCount}
            version={__CLI_VERSION__}
            matchCount={state.filterString ? currentItems.length : undefined}
            totalCount={state.filterString ? totalItemCount : undefined}
            lastRefresh={metrics.lastRefresh}
            contextHint={contextHint}
            mouseEnabled={state.mouseEnabled}
            width={columns}
          />
        )}

        {state.overlay === 'context-menu' && (
          <ContextMenuOverlay actions={contextActions} selectedIndex={state.contextMenuIndex} title={menuTitle} maxWidth={columns - 6} />
        )}

        {state.overlay === 'filter' && (
          <FilterOverlay
            filterString={state.filterString}
            matchCount={currentItems.length}
            totalCount={totalItemCount}
            panelTitle={panel.title}
          />
        )}

        {state.overlay === 'log-filter' && (
          <LogFilterOverlay
            filterString={state.logFilterString}
            filterMode={state.logFilterMode}
          />
        )}

        {state.overlay === 'sort' && (
          <SortOverlay selectedIndex={state.sortMenuIndex} currentField={state.sortField} reversed={state.sortReversed} maxWidth={columns - 6} />
        )}

        {state.overlay === 'confirm' && (
          <ConfirmOverlay
            message={state.confirmMessage}
            severity={state.confirmSeverity}
            maxWidth={columns - 6}
            onConfirm={() => {
              state.confirmAction?.();
              dispatch({ type: 'SET_CONFIRM', action: null, message: '' });
            }}
            onCancel={() => dispatch({ type: 'SET_CONFIRM', action: null, message: '' })}
          />
        )}

        {state.overlay !== 'exec' && (
          <ToastStack toasts={state.toasts} width={columns} />
        )}
      </Box>
    </MouseProvider>
  );
}
