import type {
  DashboardStateSnapshot,
  SerializedLogEntry,
  SerializedContainerStats,
} from '../types/messages';
import type { SeverityCounts, FilterMode } from '../types/log';

export interface WebviewState {
  activePanelIndex: number;
  selectedItemId: string | null;
  detailTabIndex: number;
  filterString: string;

  snapshot: DashboardStateSnapshot | null;
  logs: Map<string, SerializedLogEntry[]>;
  stats: Map<string, { stats: SerializedContainerStats | null; loading: boolean; cpuHistory?: number[]; memoryHistory?: number[] }>;
  envVars: Map<string, string[]>;
  composeLogs: Map<string, SerializedLogEntry[]>;

  // Log analysis state
  logSeverityCounts: Map<string, SeverityCounts>;
  logFilterString: string;
  logFilterMode: FilterMode;

  phrase: string;
  toasts: { id: number; message: string; severity: 'error' | 'warning' | 'info'; timer: number }[];

  // Overlay state
  confirmVisible: boolean;
  confirmMessage: string;
  confirmCallback: (() => void) | null;
  filterVisible: boolean;
  contextMenuVisible: boolean;
  contextMenuIndex: number;
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
    composeLogs: new Map(),
    logSeverityCounts: new Map(),
    logFilterString: '',
    logFilterMode: 'exact',
    phrase: '',
    toasts: [],
    confirmVisible: false,
    confirmMessage: '',
    confirmCallback: null,
    filterVisible: false,
    contextMenuVisible: false,
    contextMenuIndex: 0,
  };
}
