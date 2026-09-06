import type {
  DashboardStateSnapshot,
  DetailLoadUpdate,
  StreamStateUpdate,
  SerializedLogEntry,
  SerializedContainerStats,
  SerializedFilesystemChange,
  SerializedImageLayer,
} from '../types/messages';
import type { SeverityCounts, FilterMode } from 'sidekick-docker-shared/log';

export type SortField = 'state' | 'name' | 'cpu' | 'mem' | 'net' | 'io' | 'pids';
export type LayoutMode = 'normal' | 'wide' | 'expanded';
export type ToastSeverity = 'error' | 'warning' | 'info' | 'success';
export type ConnState = 'connecting' | 'connected' | 'disconnected';

export const SORT_OPTIONS: { field: SortField; label: string }[] = [
  { field: 'state', label: 'State (running first)' },
  { field: 'name', label: 'Name' },
  { field: 'cpu', label: 'CPU %' },
  { field: 'mem', label: 'Memory %' },
  { field: 'net', label: 'Network I/O' },
  { field: 'io', label: 'Block I/O' },
  { field: 'pids', label: 'PIDs' },
];

/** View state persisted via the webview's setState() so panels survive reloads. */
export interface PersistedViewState {
  activePanelIndex: number;
  selectedItemId: string | null;
  detailTabIndex: number;
  sortField: SortField;
  sortReversed: boolean;
  layoutMode: LayoutMode;
  showAllContainers: boolean;
}

export interface ToastEntry {
  id: number;
  message: string;
  severity: ToastSeverity;
  /** Auto-dismiss timer handle; null for sticky toasts. */
  timer: number | null;
  /** Sticky toasts (errors) stay until explicitly dismissed. */
  sticky: boolean;
}

export interface ContainerStatsEntry {
  stats: SerializedContainerStats | null;
  loading: boolean;
  cpuHistory?: number[];
  memoryHistory?: number[];
  networkRxRateHistory?: number[];
  networkTxRateHistory?: number[];
  blockReadRateHistory?: number[];
  blockWriteRateHistory?: number[];
  logSeveritySeries?: { severity: string; total: number }[];
}

export interface WebviewState {
  activePanelIndex: number;
  selectedItemId: string | null;
  detailTabIndex: number;
  filterString: string;

  snapshot: DashboardStateSnapshot | null;
  connState: ConnState;
  logs: Map<string, SerializedLogEntry[]>;
  stats: Map<string, ContainerStatsEntry>;
  envVars: Map<string, string[]>;
  containerChanges: Map<string, SerializedFilesystemChange[]>;
  imageLayers: Map<string, SerializedImageLayer[]>;
  composeLogs: Map<string, SerializedLogEntry[]>;

  detailLoads: Map<string, DetailLoadUpdate>;
  streamStates: Map<string, StreamStateUpdate>;

  // Log analysis state
  logSeverityCounts: Map<string, SeverityCounts>;
  logFilterString: string;
  logFilterMode: FilterMode;

  phrase: string;
  toasts: ToastEntry[];

  // Focus & navigation
  focusTarget: 'side' | 'detail';
  showAllContainers: boolean;

  // Sort
  sortField: SortField;
  sortReversed: boolean;
  sortOverlayVisible: boolean;
  sortMenuIndex: number;

  // Layout
  layoutMode: LayoutMode;

  // Compare mode
  compareItemIds: Record<string, string | null>;

  // Overlay state
  confirmVisible: boolean;
  confirmMessage: string;
  confirmCallback: (() => void) | null;
  filterVisible: boolean;
  contextMenuVisible: boolean;
  contextMenuIndex: number;
  helpOverlayVisible: boolean;
  versionOverlayVisible: boolean;
}

export function createInitialState(restored?: Partial<PersistedViewState>): WebviewState {
  return {
    activePanelIndex: restored?.activePanelIndex ?? 0,
    selectedItemId: restored?.selectedItemId ?? null,
    detailTabIndex: restored?.detailTabIndex ?? 0,
    filterString: '',
    snapshot: null,
    connState: 'connecting',
    logs: new Map(),
    detailLoads: new Map(),
    streamStates: new Map(),
    stats: new Map(),
    envVars: new Map(),
    containerChanges: new Map(),
    imageLayers: new Map(),
    composeLogs: new Map(),
    logSeverityCounts: new Map(),
    logFilterString: '',
    logFilterMode: 'exact',
    phrase: '',
    toasts: [],
    focusTarget: 'side',
    showAllContainers: restored?.showAllContainers ?? true,
    sortField: restored?.sortField ?? 'state',
    sortReversed: restored?.sortReversed ?? false,
    sortOverlayVisible: false,
    sortMenuIndex: 0,
    layoutMode: restored?.layoutMode ?? 'normal',
    confirmVisible: false,
    confirmMessage: '',
    confirmCallback: null,
    filterVisible: false,
    contextMenuVisible: false,
    contextMenuIndex: 0,
    helpOverlayVisible: false,
    versionOverlayVisible: false,
    compareItemIds: {},
  };
}

/** Keep the visible selection and action target identical after filtering or refresh. */
export function reconcileSelection(items: { id: string }[], selectedId: string | null): string | null {
  return items.some(item => item.id === selectedId) ? selectedId : items[0]?.id ?? null;
}
