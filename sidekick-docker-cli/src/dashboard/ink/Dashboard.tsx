import React, { useReducer, useCallback, useEffect, useRef } from 'react';
import { Box, useApp } from 'ink';
import type { DockerDashboardMetrics } from '../DockerState';
import type { SidePanel } from '../panels/types';
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
import { enableMouse, disableMouse } from './mouse';
import { LogFilterOverlay } from './LogFilterOverlay';
import { VersionOverlay } from './VersionOverlay';
import { SortOverlay } from './SortOverlay';
import { getRandomPhrase } from 'sidekick-docker-shared';
import { ExecManager } from '../ExecManager';
import { stripCursorEscapes, renderLogLines } from '../../formatters';
import type { LayoutMode, DashboardUIState, Action, SortField } from './dashboardTypes';
import { SORT_FIELDS } from './dashboardTypes';
import { buildHelpBindings, buildContextHint } from './keyRegistry';
import type { KeyContext, KeyQueryContext } from './keyRegistry';
import { maxScrollOffset } from './windowLines';


declare const __CLI_VERSION__: string;

const SIDE_PANEL_WIDTH = 28;
const SIDE_PANEL_WIDTH_WIDE = 42;
const MIN_SCREEN_WIDTH = 60;
const MIN_SCREEN_HEIGHT = 15;
const RESERVED_UI_ROWS = 5;
const TOAST_DURATIONS = { error: 6000, warning: 3000, info: 2500, success: 2000 } as const;
const MAX_QUEUED_TOASTS = 5;
const PHRASE_ROTATE_MS = 7000;

export function reducer(state: DashboardUIState, action: Action): DashboardUIState {
  switch (action.type) {
    case 'SWITCH_PANEL':
      return {
        ...state,
        activePanelIndex: action.index,
        selectedItemIndex: 0,
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
      return { ...state, selectedItemIndex: action.index, detailScrollOffset: 0, detailScrollPerTab: {}, secondaryDetailScrollOffset: 0, logFollow: true };
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
    case 'TOGGLE_FOCUS':
      return { ...state, focusTarget: state.focusTarget === 'side' ? 'detail' : 'side' };
    case 'SET_FOCUS':
      return { ...state, focusTarget: action.target };
    case 'SET_OVERLAY':
      return { ...state, overlay: action.overlay, contextMenuIndex: 0 };
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
      return { ...state, selectedItemIndex: next, detailScrollOffset: 0, logFollow: true };
    }
    case 'SET_CONFIRM':
      return { ...state, confirmAction: action.action, confirmMessage: action.message, confirmSeverity: action.severity ?? 'high', overlay: action.action ? 'confirm' : null };
    case 'EXEC_START':
      return { ...state, overlay: 'exec', execContainerId: action.containerId, execContainerName: action.containerName, execOutputLines: [] };
    case 'EXEC_APPEND_OUTPUT': {
      const MAX_EXEC_LINES = 5000;
      const parts = action.data.split('\n');
      const lines = [...state.execOutputLines];
      if (lines.length > 0) {
        lines[lines.length - 1] += parts[0];
      } else {
        lines.push(parts[0]);
      }
      for (let i = 1; i < parts.length; i++) {
        lines.push(parts[i]);
      }
      return { ...state, execOutputLines: lines.length > MAX_EXEC_LINES ? lines.slice(-MAX_EXEC_LINES) : lines };
    }
    case 'EXEC_END':
      return { ...state, overlay: null, execContainerId: null, execContainerName: '', execOutputLines: [] };
    case 'SET_LOG_FILTER':
      return { ...state, logFilterString: action.value };
    case 'TOGGLE_LOG_FILTER_MODE':
      return { ...state, logFilterMode: state.logFilterMode === 'exact' ? 'fuzzy' : 'exact' };
    case 'TOGGLE_SHOW_ALL':
      return { ...state, showAllContainers: !state.showAllContainers, selectedItemIndex: 0 };
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
      };
    }
    case 'SCROLL_SECONDARY_DETAIL':
      return { ...state, secondaryDetailScrollOffset: action.offset };
    case 'SCROLL_SECONDARY_DETAIL_DELTA': {
      const maxOffset = maxScrollOffset(action.totalLines, action.viewportHeight);
      const next = Math.max(0, Math.min(state.secondaryDetailScrollOffset + action.delta, maxOffset));
      return { ...state, secondaryDetailScrollOffset: next };
    }
    default:
      return state;
  }
}

export const initialState: DashboardUIState = {
  activePanelIndex: 0,
  selectedItemIndex: 0,
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
};

interface DashboardProps {
  panels: SidePanel[];
  metrics: DockerDashboardMetrics;
  onViewStateChange?: (viewState: DashboardViewState) => void;
  execTriggerRef?: React.RefObject<((containerId: string, containerName: string) => void) | null>;
  onExecFallback?: (containerId: string) => Promise<void>;
  /** Endpoint overrides for the spawned `docker exec` process (see `dockerCliEnv`). */
  dockerEnv?: Record<string, string>;
}

export interface DashboardViewState {
  panelId: string;
  itemId: string | null;
  detailTabIndex: number;
  sortField: SortField;
  compareItemId: string | null;
}

export function Dashboard({ panels, metrics, onViewStateChange, execTriggerRef, onExecFallback, dockerEnv }: DashboardProps): React.ReactElement {
  const [state, dispatch] = useReducer(reducer, initialState);
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
    const handler = (data: Buffer) => {
      if (data.length === 1 && data[0] === 0x1d) {
        execManagerRef.current?.dispose();
        execManagerRef.current = null;
        enableMouse();
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
      const dur = duration ?? TOAST_DURATIONS[severity];
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

      disableMouse();
      dispatch({ type: 'EXEC_START', containerId, containerName });

      manager.start({
        containerId,
        containerName,
        cols: columns,
        rows,
        env: dockerEnv,
        onData: (data) => {
          const cleaned = stripCursorEscapes(data);
          dispatch({ type: 'EXEC_APPEND_OUTPUT', data: cleaned });
        },
        onExit: () => {
          execManagerRef.current?.dispose();
          execManagerRef.current = null;
          enableMouse();
          dispatch({ type: 'EXEC_END' });
        },
      }).then(async (started) => {
        if (!started && execManagerRef.current === manager) {
          try {
            if (!onExecFallback) throw new Error('Interactive exec is unavailable.');
            execInFallbackRef.current = true;
            // The embedded PTY input listener must release stdin to the child too.
            if (execInputHandlerRef.current) process.stdin.removeListener('data', execInputHandlerRef.current);
            await suspendTerminal(() => onExecFallback(containerId));
          } finally {
            execInFallbackRef.current = false;
            manager.dispose();
            execManagerRef.current = null;
            enableMouse();
            dispatch({ type: 'EXEC_END' });
          }
        }
      }).catch((error: unknown) => {
        manager.dispose();
        execManagerRef.current = null;
        enableMouse();
        dispatch({ type: 'EXEC_END' });
        addToast(error instanceof Error ? error.message : String(error), 'error');
      });
    };
    return () => { execTriggerRef.current = null; };
  }, [execTriggerRef, onExecFallback, columns, rows, dockerEnv, suspendTerminal, addToast]);

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

  // Items for the active panel: filtered + sorted, memoized so UI-only renders
  // (toasts, scroll, phrase) don't refilter/resort. metrics identity changes on
  // every data refresh, which is exactly when recomputation is needed.
  const { currentItems, totalItemCount } = React.useMemo(() => {
    const allItems = panel.getItems(metrics);
    const total = allItems.length;
    let items = allItems;
    // Show all / running-only toggle (containers panel)
    if (panel.id === 'containers' && !state.showAllContainers) {
      items = items.filter(it => {
        const c = it.data as import('sidekick-docker-shared').ContainerInfo;
        return c.state === 'running' || c.state === 'paused';
      });
    }
    if (state.filterString) {
      const f = state.filterString.toLowerCase();
      items = items.filter(it => {
        const text = panel.getSearchableText?.(it) ?? it.label;
        return text.toLowerCase().includes(f);
      });
    }
    // Copy before sorting: the array may be the memoized/panel-owned one.
    items = [...items];
    // Sort: use sortField for containers panel, default sortKey otherwise
    if (panel.id === 'containers' && state.sortField !== 'state') {
      const dir = state.sortReversed ? -1 : 1;
      items.sort((a, b) => {
        const ca = a.data as import('sidekick-docker-shared').ContainerInfo;
        const cb = b.data as import('sidekick-docker-shared').ContainerInfo;
        switch (state.sortField) {
          case 'name': return dir * ca.name.localeCompare(cb.name);
          case 'cpu': {
            const sa = metrics.statsCollector.getLatest(ca.id)?.cpuPercent ?? 0;
            const sb = metrics.statsCollector.getLatest(cb.id)?.cpuPercent ?? 0;
            return dir * (sb - sa);
          }
          case 'mem': {
            const sa = metrics.statsCollector.getLatest(ca.id)?.memoryPercent ?? 0;
            const sb = metrics.statsCollector.getLatest(cb.id)?.memoryPercent ?? 0;
            return dir * (sb - sa);
          }
          case 'net': {
            const sa = metrics.statsCollector.getLatest(ca.id);
            const sb = metrics.statsCollector.getLatest(cb.id);
            return dir * (((sb?.networkRx ?? 0) + (sb?.networkTx ?? 0)) - ((sa?.networkRx ?? 0) + (sa?.networkTx ?? 0)));
          }
          case 'io': {
            const sa = metrics.statsCollector.getLatest(ca.id);
            const sb = metrics.statsCollector.getLatest(cb.id);
            return dir * (((sb?.blockRead ?? 0) + (sb?.blockWrite ?? 0)) - ((sa?.blockRead ?? 0) + (sa?.blockWrite ?? 0)));
          }
          case 'pids': {
            const sa = metrics.statsCollector.getLatest(ca.id)?.pids ?? 0;
            const sb = metrics.statsCollector.getLatest(cb.id)?.pids ?? 0;
            return dir * (sb - sa);
          }
          default: return a.sortKey - b.sortKey;
        }
      });
    } else {
      const dir = state.sortReversed ? -1 : 1;
      items.sort((a, b) => dir * (a.sortKey - b.sortKey));
    }
    return { currentItems: items, totalItemCount: total };
  }, [panel, metrics, state.showAllContainers, state.filterString, state.sortField, state.sortReversed]);
  const clampedSelection = Math.min(state.selectedItemIndex, Math.max(0, currentItems.length - 1));

  if (clampedSelection !== state.selectedItemIndex && currentItems.length > 0) {
    dispatch({ type: 'SELECT_ITEM', index: clampedSelection });
  }

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

  // Auto-clear compare when selected item equals pinned item
  useEffect(() => {
    if (compareItemId && selectedItem?.id === compareItemId) {
      dispatch({ type: 'PIN_COMPARE', panelId: panel.id, itemId: compareItemId });
    }
  }, [selectedItem?.id, compareItemId, panel.id]);

  useEffect(() => {
    onViewStateChange?.({
      panelId: panel.id,
      itemId: selectedItem?.id ?? null,
      detailTabIndex: tabIdx,
      sortField: state.sortField,
      compareItemId,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel.id, selectedItem?.id, tabIdx, state.sortField, compareItemId]);

  // Merge log filter UI state into metrics for panel render functions
  const enrichedMetrics = {
    ...metrics,
    logFilterString: state.logFilterString,
    logFilterMode: state.logFilterMode,
  };

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
  const isCompareActive = compareItemId != null && shouldAutoScroll;
  const scrollViewportHeight = isCompareActive ? Math.max(1, detailViewportHeight - 1) : detailViewportHeight;

  useEffect(() => {
    if (shouldAutoScroll && state.logFollow && detailLines.length > scrollViewportHeight) {
      dispatch({ type: 'SCROLL_DETAIL', offset: maxScrollOffset(detailLines.length, scrollViewportHeight) });
    }
  }, [shouldAutoScroll, state.logFollow, detailLines.length, scrollViewportHeight]);
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

  // Auto-scroll secondary pane (compare panes follow together with the primary)
  useEffect(() => {
    if (isCompareActive && state.logFollow && secondaryDetailLines.length > scrollViewportHeight) {
      dispatch({ type: 'SCROLL_SECONDARY_DETAIL', offset: maxScrollOffset(secondaryDetailLines.length, scrollViewportHeight) });
    }
  }, [isCompareActive, state.logFollow, secondaryDetailLines.length, scrollViewportHeight]);

  // Find the compare item's label for the pane header
  const compareItemLabel = React.useMemo(() => {
    if (!compareItemId) return '';
    const item = currentItems.find(it => it.id === compareItemId);
    return item ? item.label.replace(/^[^\w]*/, '').trim() : compareItemId.slice(0, 12);
  }, [compareItemId, currentItems]);

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
    return { total: p.getItems(metrics).length };
  }), [panels, metrics, runningCount]);

  // Mouse input (extracted hook)
  const handleMouse = useMouseHandler({
    state, dispatch, panels, panelCounts, currentItems, clampedSelection,
    selectedItem, applicableActions, sideWidth, sideViewportHeight, sideScroll, detailLines,
    detailViewportHeight: scrollViewportHeight, detailTabs, tabIdx, rows, columns, addToast, removeToast,
  });

  // Read-only slice: safe to consume during render (help overlay, status hints).
  const keyQueryCtx: KeyQueryContext = {
    state, panel, selectedItem, applicableActions, detailTabs, tabIdx,
    secondaryDetailLineCount: secondaryDetailLines.length,
  };

  // Full context for key handlers — adds dispatch/addToast/exit, which close
  // over refs and must therefore never reach a render-time call.
  const keyCtx: KeyContext = {
    ...keyQueryCtx,
    dispatch, panels, clampedSelection, currentItems, detailLines,
    detailViewportHeight: scrollViewportHeight, sideScroll, addToast, exit,
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
    <MouseProvider onMouse={handleMouse}>
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
                totalCount={totalItemCount}
                runningCount={panel.id === 'containers' ? runningCount : undefined}
                compareItemId={compareItemId || undefined}
                listState={listState}
              />
            )}
            <Box flexDirection="column" flexGrow={1}>
              <DetailTabBar tabs={detailTabs} activeIndex={tabIdx} followPaused={followPaused} width={columns - sideWidth} />
              {isCompareActive ? (
                <CompareDetailPane
                  primaryLines={detailLines}
                  secondaryLines={secondaryDetailLines}
                  primaryScrollOffset={state.detailScrollOffset}
                  secondaryScrollOffset={state.secondaryDetailScrollOffset}
                  viewportHeight={scrollViewportHeight}
                  totalWidth={columns - sideWidth}
                  focused={state.focusTarget === 'detail'}
                  primaryLabel={selectedItem?.label.replace(/^[^\w]*/, '').trim() ?? ''}
                  secondaryLabel={compareItemLabel}
                />
              ) : (
                <DetailPane
                  lines={detailLines}
                  scrollOffset={state.detailScrollOffset}
                  viewportHeight={detailViewportHeight}
                  focused={state.focusTarget === 'detail'}
                />
              )}
            </Box>
          </Box>
        )}

        {state.overlay === 'help' && (
          <HelpOverlay panels={panels} activePanelIndex={state.activePanelIndex} version={__CLI_VERSION__} bindings={buildHelpBindings(keyQueryCtx)} />
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
            width={columns}
          />
        )}

        {state.overlay === 'context-menu' && (
          <ContextMenuOverlay actions={contextActions} selectedIndex={state.contextMenuIndex} maxWidth={columns - 6} />
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
