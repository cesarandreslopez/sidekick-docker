import type { FilterMode } from 'sidekick-docker-shared';

export type LayoutMode = 'normal' | 'wide' | 'expanded';
export type OverlayKind = null | 'help' | 'context-menu' | 'filter' | 'confirm' | 'exec' | 'version' | 'log-filter' | 'sort';

export type SortField = 'state' | 'name' | 'cpu' | 'mem' | 'net' | 'io' | 'pids';
export type FocusTarget = 'side' | 'detail';

export interface ToastEntry {
  id: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
  expiresAt: number;
}

export interface DashboardUIState {
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
  logFilterString: string;
  logFilterMode: FilterMode;
  showAllContainers: boolean;
  sortField: SortField;
  sortReversed: boolean;
  sortMenuIndex: number;
}

export type Action =
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
  | { type: 'EXEC_END' }
  | { type: 'SET_LOG_FILTER'; value: string }
  | { type: 'TOGGLE_LOG_FILTER_MODE' }
  | { type: 'TOGGLE_SHOW_ALL' }
  | { type: 'SET_SORT_FIELD'; field: SortField }
  | { type: 'TOGGLE_SORT_REVERSE' }
  | { type: 'SORT_MENU_NAV'; delta: number };
