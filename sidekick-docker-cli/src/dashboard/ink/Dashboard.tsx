import React, { useReducer, useCallback, useEffect, useRef } from 'react';
import { Box, useInput, useApp } from 'ink';
import type { DockerDashboardMetrics } from '../DockerState';
import type { SidePanel, PanelItem, PanelAction } from '../panels/types';
import { useTerminalSize } from './useTerminalSize';
import { useWindowedScroll } from './useWindowedScroll';
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
import type { TerminalMouseEvent } from './mouse';
import { VersionOverlay } from './VersionOverlay';
import { getRandomPhrase } from 'sidekick-docker-shared';
import { ExecManager } from '../ExecManager';
import { stripCursorEscapes } from '../../formatters';

declare const __CLI_VERSION__: string;

const SIDE_PANEL_WIDTH = 28;
const MIN_SCREEN_WIDTH = 60;
const MIN_SCREEN_HEIGHT = 15;

type LayoutMode = 'normal' | 'expanded';
type OverlayKind = null | 'help' | 'context-menu' | 'filter' | 'confirm' | 'exec' | 'version';
type FocusTarget = 'side' | 'detail';

interface ToastEntry {
  id: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
  expiresAt: number;
}

interface DashboardUIState {
  activePanelIndex: number;
  selectedItemIndex: number;
  detailTabIndex: number;
  layoutMode: LayoutMode;
  focusTarget: FocusTarget;
  overlay: OverlayKind;
  filterString: string;
  detailScrollOffset: number;
  toasts: ToastEntry[];
  contextMenuIndex: number;
  confirmAction: (() => void) | null;
  confirmMessage: string;
  execOutputLines: string[];
  execContainerId: string | null;
  execContainerName: string;
}

type Action =
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
  | { type: 'ADD_TOAST'; toast: ToastEntry }
  | { type: 'REMOVE_TOAST'; id: number }
  | { type: 'CONTEXT_MENU_NAV'; delta: number; itemCount: number }
  | { type: 'SCROLL_SIDE'; delta: number; itemCount: number }
  | { type: 'SET_CONFIRM'; action: (() => void) | null; message: string }
  | { type: 'EXEC_START'; containerId: string; containerName: string }
  | { type: 'EXEC_APPEND_OUTPUT'; data: string }
  | { type: 'EXEC_END' };

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
      const next: LayoutMode = state.layoutMode === 'normal' ? 'expanded' : 'normal';
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
      // Append first part to current (last) line — PTY data is streamed character-by-character
      if (lines.length > 0) {
        lines[lines.length - 1] += parts[0];
      } else {
        lines.push(parts[0]);
      }
      // Remaining parts after \n are new lines
      for (let i = 1; i < parts.length; i++) {
        lines.push(parts[i]);
      }
      return { ...state, execOutputLines: lines.length > MAX_EXEC_LINES ? lines.slice(-MAX_EXEC_LINES) : lines };
    }
    case 'EXEC_END':
      return { ...state, overlay: null, execContainerId: null, execContainerName: '', execOutputLines: [] };
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
  const { exit } = useApp();
  const { columns, rows } = useTerminalSize();
  const toastIdRef = useRef(0);
  const execManagerRef = useRef<ExecManager | null>(null);

  // Rotating phrase in tab bar (7-second interval + on any interaction)
  const [phrase, setPhrase] = React.useState(() => getRandomPhrase());
  const phraseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rotatePhrase = useCallback(() => {
    setPhrase(getRandomPhrase());
    if (phraseTimerRef.current) clearTimeout(phraseTimerRef.current);
    phraseTimerRef.current = setTimeout(rotatePhrase, 7000);
  }, []);
  useEffect(() => {
    phraseTimerRef.current = setTimeout(rotatePhrase, 7000);
    return () => { if (phraseTimerRef.current) clearTimeout(phraseTimerRef.current); };
  }, [rotatePhrase]);

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
          // node-pty unavailable — fall back to spawnSync teardown
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
      // Ctrl+] (0x1d) = detach from exec
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
    const durations = { error: 4000, warning: 3000, info: 2000 };
    const id = ++toastIdRef.current;
    dispatch({ type: 'ADD_TOAST', toast: { id, message, severity, expiresAt: Date.now() + durations[severity] } });
    setTimeout(() => dispatch({ type: 'REMOVE_TOAST', id }), durations[severity]);
  }, []);

  // Derived values
  const panel = panels[state.activePanelIndex];
  const tooSmall = columns < MIN_SCREEN_WIDTH || rows < MIN_SCREEN_HEIGHT;
  const sideWidth = state.layoutMode === 'expanded' ? 0 : SIDE_PANEL_WIDTH;

  // Get items with filter
  const getFilteredItems = useCallback((): PanelItem[] => {
    let items = panel.getItems(metrics);
    if (state.filterString) {
      const f = state.filterString.toLowerCase();
      items = items.filter(it => {
        const text = panel.getSearchableText?.(it) ?? it.label;
        return text.toLowerCase().includes(f);
      });
    }
    items.sort((a, b) => a.sortKey - b.sortKey);
    return items;
  }, [panel, metrics, state.filterString]);

  const currentItems = getFilteredItems();
  const clampedSelection = Math.min(state.selectedItemIndex, Math.max(0, currentItems.length - 1));

  if (clampedSelection !== state.selectedItemIndex && currentItems.length > 0) {
    dispatch({ type: 'SELECT_ITEM', index: clampedSelection });
  }

  const sideViewportHeight = Math.max(1, rows - 5);
  const sideScroll = useWindowedScroll({ totalItems: currentItems.length, viewportHeight: sideViewportHeight });

  useEffect(() => {
    if (sideScroll.selectedIndex !== state.selectedItemIndex) {
      sideScroll.setSelected(state.selectedItemIndex);
    }
  }, [state.selectedItemIndex]);

  const selectedItem = currentItems[clampedSelection];

  useEffect(() => {
    onSelectionChange?.(panel.id, selectedItem?.id ?? null);
  }, [panel.id, selectedItem?.id]);

  const detailTabs = panel.detailTabs;
  const tabIdx = Math.min(state.detailTabIndex, detailTabs.length - 1);

  let detailContent = '';
  if (selectedItem && detailTabs.length > 0 && tabIdx >= 0) {
    detailContent = detailTabs[tabIdx].render(selectedItem, metrics);
  } else if (!selectedItem) {
    detailContent = '(no item selected)';
  }

  const detailLines = detailContent.split('\n');
  const detailViewportHeight = Math.max(1, rows - 5);

  // Auto-scroll to bottom when the active tab requests it (e.g. Logs)
  const activeTab = detailTabs[tabIdx];
  const shouldAutoScroll = activeTab?.autoScrollBottom ?? false;
  useEffect(() => {
    if (shouldAutoScroll && detailLines.length > detailViewportHeight) {
      dispatch({ type: 'SCROLL_DETAIL', offset: detailLines.length - detailViewportHeight });
    }
  }, [shouldAutoScroll, detailLines.length, detailViewportHeight]);

  // Context menu
  const getContextActions = useCallback((): PanelAction[] => {
    if (!selectedItem) return [];
    return panel.getActions().filter(a => !a.condition || a.condition(selectedItem));
  }, [panel, selectedItem]);

  const contextActions = state.overlay === 'context-menu' ? getContextActions() : [];

  // Mouse input
  const handleMouse = useCallback((event: TerminalMouseEvent) => {
    rotatePhrase();
    // Filter overlay: ignore all mouse events (raw escape bytes leak into filter string)
    if (state.overlay === 'filter') return;
    // Overlays: click anywhere dismisses
    if (state.overlay) {
      if (event.type === 'click') {
        dispatch({ type: 'SET_OVERLAY', overlay: null });
      }
      return;
    }

    const { x, y } = event;

    // Scroll wheel
    if (event.type === 'scroll') {
      if (x < sideWidth && sideWidth > 0) {
        const delta = event.scrollDirection === 'down' ? 3 : -3;
        dispatch({ type: 'SCROLL_SIDE', delta, itemCount: currentItems.length });
        const newIdx = Math.max(0, Math.min(clampedSelection + delta, currentItems.length - 1));
        sideScroll.setSelected(newIdx);
      } else {
        const delta = event.scrollDirection === 'down' ? 3 : -3;
        dispatch({ type: 'SCROLL_DETAIL_DELTA', delta, totalLines: detailLines.length, viewportHeight: detailViewportHeight });
      }
      return;
    }

    if (event.type !== 'click' || event.button !== 'left') return;

    // Row 0: TabBar
    if (y === 0) {
      let col = 0;
      for (let i = 0; i < panels.length; i++) {
        // Each tab renders as " N Title" + count + " " + marginRight=1
        const count = panelCounts[i];
        let countLen = 0;
        if (count) {
          countLen = count.running !== undefined
            ? ` ${count.running}/${count.total}`.length
            : ` ${count.total}`.length;
        }
        const tabWidth = String(panels[i].shortcutKey).length + panels[i].title.length + 3 + countLen + 1;
        if (x >= col && x < col + tabWidth) {
          panels[state.activePanelIndex]?.onDeactivate?.();
          dispatch({ type: 'SWITCH_PANEL', index: i });
          panels[i]?.onActivate?.();
          return;
        }
        col += tabWidth;
      }
      return;
    }

    // Last row: StatusBar (no action)
    if (y >= rows - 1) return;

    // Main content area
    if (x < sideWidth && sideWidth > 0) {
      // Click in side list
      dispatch({ type: 'SET_FOCUS', target: 'side' });
      // Row 0 = tab bar, row 1 = border/panel title row
      // When scrolled down, a "▲" indicator takes an extra row
      const hasScrollUp = sideScroll.scrollOffset > 0;
      const itemRow = y - 2 - (hasScrollUp ? 1 : 0);
      const itemIndex = sideScroll.scrollOffset + itemRow;
      if (itemIndex >= 0 && itemIndex < currentItems.length) {
        dispatch({ type: 'SELECT_ITEM', index: itemIndex });
        sideScroll.setSelected(itemIndex);
      }
    } else {
      // Click in detail area
      dispatch({ type: 'SET_FOCUS', target: 'detail' });

      // Row 1 = DetailTabBar — check for tab click
      if (y === 1 && detailTabs.length > 1) {
        let col = sideWidth;
        for (let i = 0; i < detailTabs.length; i++) {
          // "▸ Label" or "  Label" + marginRight=1
          const tabWidth = detailTabs[i].label.length + 3;
          if (x >= col && x < col + tabWidth) {
            dispatch({ type: 'SET_DETAIL_TAB', index: i });
            return;
          }
          col += tabWidth;
        }
      }
    }
  }, [state.overlay, state.activePanelIndex, sideWidth, currentItems.length, clampedSelection, sideScroll, detailLines.length, detailViewportHeight, panels, detailTabs, rows, rotatePhrase]);

  // Keyboard input
  useInput((input, key) => {
    // Exec overlay: all input handled via raw stdin handler, ignore here
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

    // Filter overlay
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

  // Render
  if (tooSmall) {
    return <TooSmallOverlay columns={columns} rows={rows} />;
  }

  const runningCount = metrics.containers.filter(c => c.state === 'running').length;

  // Compute per-panel item counts for TabBar badges
  const panelCounts = panels.map((p) => {
    const items = p.getItems(metrics);
    if (p.id === 'containers') {
      const running = items.filter(it => {
        const d = it.data as { state?: string } | null;
        return d?.state === 'running';
      }).length;
      return { total: items.length, running };
    }
    if (p.id === 'services') {
      // Services panel includes project headers + services; count only meaningful items
      const meaningful = items.filter(it => it.data !== null).length;
      return { total: meaningful };
    }
    return { total: items.length };
  });

  const showNormalLayout = state.overlay !== 'help' && state.overlay !== 'exec' && state.overlay !== 'version';

  // Compute unfiltered total count for filter display
  const allItems = panel.getItems(metrics);
  const totalItemCount = allItems.length;

  // Panel action hints for status bar
  const panelActionHints = selectedItem
    ? panel.getActions()
        .filter(a => !a.condition || a.condition(selectedItem))
        .map(a => `${a.key}:${a.label}`)
        .join('  ')
    : '';

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
            panelHints=""
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
