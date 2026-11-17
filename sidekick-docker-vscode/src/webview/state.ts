import type {
  DashboardStateSnapshot,
  DetailLoadUpdate,
  StreamStateUpdate,
  SerializedLogEntry,
  SerializedContainerStats,
  SerializedFilesystemChange,
  SerializedImageLayer,
  SerializedContainerDetails,
} from '../types/messages';
import type { SeverityCounts, FilterMode } from 'sidekick-docker-shared/log';

export type SortField = 'state' | 'name' | 'cpu' | 'mem' | 'net' | 'io' | 'pids';
export type LayoutMode = 'normal' | 'wide' | 'expanded';
export type ToastSeverity = 'error' | 'warning' | 'info' | 'success';
export type ConnState = 'connecting' | 'connected' | 'disconnected';

export const SORT_OPTIONS: { field: SortField; label: string }[] = [
  { field: 'state', label: 'State' },
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
  /** `w`: wrap long log lines (default) or keep them on one line and scroll sideways. */
  logWrap: boolean;
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
  /** Why the last connection attempt failed, when the extension knows. */
  connReason: string | null;
  /**
   * A reconnect after a failure is running: the "Cannot connect" banner stays
   * up (Retry disabled) instead of uncovering the stale list underneath.
   */
  connRetrying: boolean;
  logs: Map<string, SerializedLogEntry[]>;
  stats: Map<string, ContainerStatsEntry>;
  /** Inspect details per container (env, restart policy, mounts, health, exit). */
  containerDetails: Map<string, SerializedContainerDetails>;
  containerChanges: Map<string, SerializedFilesystemChange[]>;
  /** When each container's filesystem changes arrived (epoch ms), shown as "as of". */
  containerChangesAt: Map<string, number>;
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
  logWrap: boolean;

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
    connReason: null,
    connRetrying: false,
    logs: new Map(),
    detailLoads: new Map(),
    streamStates: new Map(),
    stats: new Map(),
    containerDetails: new Map(),
    containerChanges: new Map(),
    containerChangesAt: new Map(),
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
    // On by default: a long line (a stack trace, a JSON blob) is readable
    // without scrolling sideways; `w` turns it off.
    logWrap: restored?.logWrap ?? true,
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

type LogKeyed = Pick<SerializedLogEntry, 'timestamp' | 'stream' | 'message'>;

function logKey(e: LogKeyed): string {
  return `${e.timestamp ?? ''}\u0000${e.stream}\u0000${e.message}`;
}

/**
 * How many entries a log ring buffer dropped from its front between two
 * snapshots, when `next` is `prev` minus that prefix plus appended lines — or
 * null when the two do not line up that way (cleared, replaced, reordered).
 *
 * The host resends the whole buffer on every flush; once it is full the first
 * line changes every time, so without this the pane re-rendered every line on
 * every flush, losing the text selection and drifting the scroll position.
 */
export function droppedLogPrefix(prev: readonly LogKeyed[], next: readonly LogKeyed[]): number | null {
  if (prev.length === 0 || next.length === 0) return null;
  const first = logKey(next[0]);
  for (let dropped = 0; dropped < prev.length; dropped++) {
    const kept = prev.length - dropped;
    if (kept > next.length || logKey(prev[dropped]) !== first) continue;
    // Cheap rejection on the last kept line before checking the whole run.
    if (logKey(prev[prev.length - 1]) !== logKey(next[kept - 1])) continue;
    let aligned = true;
    for (let i = 1; i < kept - 1; i++) {
      if (logKey(prev[dropped + i]) !== logKey(next[i])) { aligned = false; break; }
    }
    if (aligned) return dropped;
  }
  return null;
}
