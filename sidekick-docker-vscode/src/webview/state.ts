import type {
  DashboardStateSnapshot,
  SerializedLogEntry,
  SerializedContainerStats,
  SerializedFilesystemChange,
  SerializedImageLayer,
} from '../types/messages';
import type { SeverityCounts, FilterMode } from 'sidekick-docker-shared/log';

export type SortField = 'state' | 'name' | 'cpu' | 'mem' | 'net' | 'io' | 'pids';
export type LayoutMode = 'normal' | 'wide' | 'expanded';
export type ToastSeverity = 'error' | 'warning' | 'info' | 'success';

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
  logs: Map<string, SerializedLogEntry[]>;
  stats: Map<string, ContainerStatsEntry>;
  envVars: Map<string, string[]>;
  containerChanges: Map<string, SerializedFilesystemChange[]>;
  imageLayers: Map<string, SerializedImageLayer[]>;
  composeLogs: Map<string, SerializedLogEntry[]>;

  // Log analysis state
  logSeverityCounts: Map<string, SeverityCounts>;
  logFilterString: string;
  logFilterMode: FilterMode;

  phrase: string;
  toasts: { id: number; message: string; severity: ToastSeverity; timer: number }[];

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

export function createInitialState(): WebviewState {
  return {
    activePanelIndex: 0,
    selectedItemId: null,
    detailTabIndex: 0,
    filterString: '',
    snapshot: null,
    logs: new Map(),
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
    showAllContainers: true,
    sortField: 'state',
    sortReversed: false,
    sortOverlayVisible: false,
    sortMenuIndex: 0,
    layoutMode: 'normal',
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
