import React, { useReducer, useCallback, useEffect, useRef } from 'react';
import { Box } from 'ink';
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
import { StatusBar } from './StatusBar';
import { HelpOverlay } from './HelpOverlay';
import { FilterOverlay } from './FilterOverlay';
import { ContextMenuOverlay } from './ContextMenuOverlay';
import { ConfirmOverlay } from './ConfirmOverlay';
import { ToastNotification } from './ToastNotification';
import { TooSmallOverlay } from './TooSmallOverlay';
import { ExecOverlay } from './ExecOverlay';
import { MouseProvider } from './mouse';
import { enableMouse, disableMouse } from './mouse';
import { LogFilterOverlay } from './LogFilterOverlay';
import { VersionOverlay } from './VersionOverlay';
import { getRandomPhrase } from 'sidekick-docker-shared';
import { ExecManager } from '../ExecManager';
import { stripCursorEscapes } from '../../formatters';
import type { LayoutMode, DashboardUIState, Action } from './dashboardTypes';

declare const __CLI_VERSION__: string;

const SIDE_PANEL_WIDTH = 28;
const SIDE_PANEL_WIDTH_WIDE = 42;
const MIN_SCREEN_WIDTH = 60;
const MIN_SCREEN_HEIGHT = 15;
const RESERVED_UI_ROWS = 5;
const TOAST_DURATIONS = { error: 4000, warning: 3000, info: 2000 } as const;

function reducer(state: DashboardUIState, action: Action): DashboardUIState {
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
      };
    case 'SELECT_ITEM':
      return { ...state, selectedItemIndex: action.index, detailTabIndex: 0, detailScrollOffset: 0 };
    case 'SET_DETAIL_TAB':
      return { ...state, detailTabIndex: action.index, detailScrollOffset: 0 };
    case 'CYCLE_DETAIL_TAB': {
      if (action.tabCount <= 1) return state;
      const next = (state.detailTabIndex + action.direction + action.tabCount) % action.tabCount;
      return { ...state, detailTabIndex: next, detailScrollOffset: 0 };
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
      return { ...state, detailScrollOffset: action.offset };
    }
    case 'SCROLL_DETAIL_DELTA': {
      const maxOffset = Math.max(0, action.totalLines - action.viewportHeight);
      const next = Math.max(0, Math.min(state.detailScrollOffset + action.delta, maxOffset));
      return { ...state, detailScrollOffset: next };
    }
    case 'ADD_TOAST':
      return { ...state, toasts: [...state.toasts, action.toast] };
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
      return { ...state, selectedItemIndex: next, detailTabIndex: 0, detailScrollOffset: 0 };
    }
    case 'SET_CONFIRM':
      return { ...state, confirmAction: action.action, confirmMessage: action.message, overlay: action.action ? 'confirm' : null };
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
    default:
      return state;
  }
}

const initialState: DashboardUIState = {
  activePanelIndex: 0,
  selectedItemIndex: 0,
  detailTabIndex: 0,
  layoutMode: 'normal',
  focusTarget: 'side',
  overlay: null,
  filterString: '',
  detailScrollOffset: 0,
  toasts: [],
  contextMenuIndex: 0,
  confirmAction: null,
  confirmMessage: '',
  execOutputLines: [],
  execContainerId: null,
  execContainerName: '',
  logFilterString: '',
  logFilterMode: 'exact',
};

interface DashboardProps {
  panels: SidePanel[];
  metrics: DockerDashboardMetrics;
  onSelectionChange?: (panelId: string, itemId: string | null) => void;
  execTriggerRef?: React.RefObject<((containerId: string, containerName: string) => void) | null>;
  onExecFallback?: (containerId: string) => void;
}

export function Dashboard({ panels, metrics, onSelectionChange, execTriggerRef, onExecFallback }: DashboardProps): React.ReactElement {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { columns, rows } = useTerminalSize();
  const toastIdRef = useRef(0);
  const execManagerRef = useRef<ExecManager | null>(null);

  // Rotating phrase in tab bar (7-second interval + on any interaction)
  const [phrase, setPhrase] = React.useState(() => getRandomPhrase());
  const phraseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rotatePhraseRef = useRef<() => void>(undefined);
  rotatePhraseRef.current = () => {
    setPhrase(getRandomPhrase());
    if (phraseTimerRef.current) clearTimeout(phraseTimerRef.current);
    phraseTimerRef.current = setTimeout(() => rotatePhraseRef.current?.(), 7000);
  };
  const rotatePhrase = useCallback(() => rotatePhraseRef.current?.(), []);
  useEffect(() => {
    phraseTimerRef.current = setTimeout(() => rotatePhraseRef.current?.(), 7000);
    return () => { if (phraseTimerRef.current) clearTimeout(phraseTimerRef.current); };
  }, []);

  // Populate exec trigger ref so external code can start exec sessions
  useEffect(() => {
    if (!execTriggerRef) return;
    execTriggerRef.current = (containerId: string, containerName: string) => {
      const manager = new ExecManager();
      execManagerRef.current = manager;

      disableMouse();
      dispatch({ type: 'EXEC_START', containerId, containerName });

      manager.start({
        containerId,
        containerName,
        cols: columns,
        rows,
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
      }).then((started) => {
        if (!started) {
          execManagerRef.current = null;
          enableMouse();
          dispatch({ type: 'EXEC_END' });
          onExecFallback?.(containerId);
        }
      });
    };
    return () => { execTriggerRef.current = null; };
  }, [execTriggerRef, onExecFallback, columns, rows]);

  // Forward raw stdin to PTY when exec overlay is active
  useEffect(() => {
    if (state.overlay !== 'exec') return;
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
    process.stdin.on('data', handler);
    return () => {
      process.stdin.removeListener('data', handler);
    };
  }, [state.overlay]);

  // Resize PTY when terminal size changes
  useEffect(() => {
    if (state.overlay === 'exec' && execManagerRef.current) {
      execManagerRef.current.resize(columns, rows);
    }
  }, [columns, rows, state.overlay]);

  const addToast = useCallback((message: string, severity: 'error' | 'warning' | 'info') => {
    const id = ++toastIdRef.current;
    dispatch({ type: 'ADD_TOAST', toast: { id, message, severity, expiresAt: Date.now() + TOAST_DURATIONS[severity] } });
    setTimeout(() => dispatch({ type: 'REMOVE_TOAST', id }), TOAST_DURATIONS[severity]);
  }, []);

  // Derived values
  const panel = panels[state.activePanelIndex];
  const tooSmall = columns < MIN_SCREEN_WIDTH || rows < MIN_SCREEN_HEIGHT;
  const sideWidth = state.layoutMode === 'expanded' ? 0
    : state.layoutMode === 'wide' ? SIDE_PANEL_WIDTH_WIDE
    : SIDE_PANEL_WIDTH;

  // Get all items for active panel (once), then filter
  const allItems = panel.getItems(metrics);
  const totalItemCount = allItems.length;

  const currentItems = (() => {
    let items = allItems;
    if (state.filterString) {
      const f = state.filterString.toLowerCase();
      items = items.filter(it => {
        const text = panel.getSearchableText?.(it) ?? it.label;
        return text.toLowerCase().includes(f);
      });
    }
    items.sort((a, b) => a.sortKey - b.sortKey);
    return items;
  })();
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

  useEffect(() => {
    onSelectionChange?.(panel.id, selectedItem?.id ?? null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel.id, selectedItem?.id]);

  const detailTabs = panel.detailTabs;
  const tabIdx = Math.min(state.detailTabIndex, detailTabs.length - 1);

  // Merge log filter UI state into metrics for panel render functions
  const enrichedMetrics = {
    ...metrics,
    logFilterString: state.logFilterString,
    logFilterMode: state.logFilterMode,
  };

  let detailContent = '';
  if (selectedItem && detailTabs.length > 0 && tabIdx >= 0) {
    detailContent = detailTabs[tabIdx].render(selectedItem, enrichedMetrics);
  } else if (!selectedItem) {
    detailContent = '(no item selected)';
  }

  const detailLines = detailContent.split('\n');
  const detailViewportHeight = Math.max(1, rows - RESERVED_UI_ROWS);

  // Auto-scroll to bottom when the active tab requests it (e.g. Logs)
  const activeTab = detailTabs[tabIdx];
  const shouldAutoScroll = activeTab?.autoScrollBottom ?? false;
  useEffect(() => {
    if (shouldAutoScroll && detailLines.length > detailViewportHeight) {
      dispatch({ type: 'SCROLL_DETAIL', offset: detailLines.length - detailViewportHeight });
    }
  }, [shouldAutoScroll, detailLines.length, detailViewportHeight]);

  // Panel actions — computed once, used by context menu, keyboard handler, and status bar
  const panelActions = panel.getActions();
  const applicableActions = selectedItem
    ? panelActions.filter(a => !a.condition || a.condition(selectedItem))
    : [];
  const contextActions = state.overlay === 'context-menu' ? applicableActions : [];

  // Compute per-panel item counts for TabBar badges
  const runningCount = metrics.containers.filter(c => c.state === 'running').length;
  const panelCounts = panels.map((p) => {
    if (p.id === 'containers') {
      return { total: metrics.containers.length, running: runningCount };
    }
    if (p.id === 'services') {
      const meaningful = metrics.composeProjects.reduce((sum, proj) => sum + proj.services.length, 0);
      return { total: meaningful };
    }
    // For the active panel we already have allItems; for others call getItems
    const items = p === panel ? allItems : p.getItems(metrics);
    return { total: items.length };
  });

  // Mouse input (extracted hook)
  const handleMouse = useMouseHandler({
    state, dispatch, panels, panelCounts, currentItems, clampedSelection,
    sideWidth, sideScroll, detailLines, detailViewportHeight, detailTabs, rows, rotatePhrase,
  });

  // Keyboard input (extracted hook)
  useKeyboardHandler({
    state, dispatch, panels, panel, selectedItem, contextActions,
    clampedSelection, currentItems, detailLines, detailViewportHeight,
    detailTabs, tabIdx, panelActions, sideScroll, addToast, rotatePhrase,
  });

  // Render
  if (tooSmall) {
    return <TooSmallOverlay columns={columns} rows={rows} />;
  }

  const showNormalLayout = state.overlay !== 'help' && state.overlay !== 'exec' && state.overlay !== 'version';

  // Panel action hints for status bar (structured for color coding)
  const panelActionHints = applicableActions
    .map(a => ({ key: a.key, label: a.label, destructive: !!a.confirm }));

  return (
    <MouseProvider onMouse={handleMouse}>
      <Box flexDirection="column" height={rows} width={columns}>
        {showNormalLayout && (
          <TabBar panels={panels} activeIndex={state.activePanelIndex} layoutMode={state.layoutMode} phrase={phrase} panelCounts={panelCounts} />
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
              />
            )}
            <Box flexDirection="column" flexGrow={1}>
              <DetailTabBar tabs={detailTabs} activeIndex={state.detailTabIndex} />
              <DetailPane
                content={detailContent}
                scrollOffset={state.detailScrollOffset}
                viewportHeight={detailViewportHeight}
                focused={state.focusTarget === 'detail'}
              />
            </Box>
          </Box>
        )}

        {state.overlay === 'help' && (
          <HelpOverlay panels={panels} activePanelIndex={state.activePanelIndex} version={__CLI_VERSION__} />
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
            focusTarget={state.focusTarget}
            panelActionHints={panelActionHints}
            filterString={state.filterString}
            containerCount={metrics.containers.length}
            runningCount={runningCount}
            version={__CLI_VERSION__}
            matchCount={state.filterString ? currentItems.length : undefined}
            totalCount={state.filterString ? totalItemCount : undefined}
            lastRefresh={metrics.lastRefresh}
          />
        )}

        {state.overlay === 'context-menu' && (
          <ContextMenuOverlay actions={contextActions} selectedIndex={state.contextMenuIndex} />
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

        {state.overlay === 'confirm' && (
          <ConfirmOverlay
            message={state.confirmMessage}
            onConfirm={() => {
              state.confirmAction?.();
              dispatch({ type: 'SET_CONFIRM', action: null, message: '' });
            }}
            onCancel={() => dispatch({ type: 'SET_CONFIRM', action: null, message: '' })}
          />
        )}

        {state.toasts.length > 0 && (
          <ToastNotification toast={state.toasts[state.toasts.length - 1]} />
        )}
      </Box>
    </MouseProvider>
  );
}
