/** Serialized container info (Dates → ISO strings for postMessage). */
export interface SerializedContainerInfo {
  id: string;
  name: string;
  image: string;
  state: 'running' | 'paused' | 'restarting' | 'exited' | 'dead' | 'created' | 'removing';
  status: string;
  ports: { hostIp: string; hostPort: number; containerPort: number; protocol: 'tcp' | 'udp' }[];
  created: string;
  composeProject?: string;
  composeService?: string;
  healthStatus?: 'healthy' | 'unhealthy' | 'starting';
}

export interface SerializedImageInfo {
  id: string;
  repoTags: string[];
  size: number;
  created: string;
  isDangling: boolean;
}

export interface SerializedVolumeInfo {
  name: string;
  driver: string;
  mountpoint: string;
  created: string;
  isInUse: boolean;
}

export interface SerializedNetworkInfo {
  id: string;
  name: string;
  driver: string;
  scope: string;
  containers: { containerId: string; containerName: string }[];
  isDefault: boolean;
}

export interface SerializedComposeService {
  name: string;
  projectName: string;
  containerId?: string;
  state: 'running' | 'paused' | 'exited' | 'restarting' | 'dead' | 'created' | 'not_created';
  image: string;
  ports: string[];
}

export interface SerializedComposeProject {
  name: string;
  configFile?: string;
  services: SerializedComposeService[];
  status: 'running' | 'partial' | 'stopped';
}

export interface SerializedContainerStats {
  cpuPercent: number;
  memoryUsage: number;
  memoryLimit: number;
  memoryPercent: number;
  networkRx: number;
  networkTx: number;
  blockRead: number;
  blockWrite: number;
  pids: number;
}

export interface SerializedLogEntry {
  timestamp: string | null;
  stream: 'stdout' | 'stderr';
  message: string;
}

export interface SerializedFilesystemChange {
  path: string;
  kind: 'added' | 'changed' | 'deleted';
}

export interface SerializedImageLayer {
  id: string;
  created: string;
  createdBy: string;
  size: number;
  comment: string;
}

/** Full state snapshot sent to webview. */
export interface DashboardStateSnapshot {
  containers: SerializedContainerInfo[];
  images: SerializedImageInfo[];
  volumes: SerializedVolumeInfo[];
  networks: SerializedNetworkInfo[];
  composeProjects: SerializedComposeProject[];
  daemonConnected: boolean;
  lastRefresh: string | null;
}

// ─── Extension → Webview ────────────────────────────────────────────

export type ExtensionMessage =
  | { type: 'updateState'; snapshot: DashboardStateSnapshot }
  | { type: 'updateLogs'; containerId: string; entries: SerializedLogEntry[] }
  | { type: 'updateStats'; containerId: string; stats: SerializedContainerStats | null; loading: boolean; cpuHistory?: number[]; memoryHistory?: number[]; networkRxRateHistory?: number[]; networkTxRateHistory?: number[]; blockReadRateHistory?: number[]; blockWriteRateHistory?: number[]; logSeveritySeries?: { severity: string; total: number }[] }
  | { type: 'updateEnv'; containerId: string; env: string[] }
  | { type: 'phraseBank'; phrases: string[] }
  | { type: 'toast'; message: string; severity: 'error' | 'warning' | 'info' | 'success' }
  | { type: 'focusContainer'; containerId: string }
  | { type: 'updateComposeLogs'; projectName: string; serviceName: string | null; entries: SerializedLogEntry[] }
  | { type: 'updateChanges'; containerId: string; changes: SerializedFilesystemChange[] }
  | { type: 'updateLayers'; imageId: string; layers: SerializedImageLayer[] };

// ─── Webview → Extension ────────────────────────────────────────────

export type WebviewMessage =
  | { type: 'webviewReady' }
  | { type: 'switchPanel'; panelIndex: number }
  | { type: 'selectItem'; panelId: string; itemId: string | null }
  | { type: 'switchDetailTab'; tabIndex: number }
  | { type: 'action'; actionType: string; itemId: string; panelId: string }
  | { type: 'filterChange'; filter: string }
  | { type: 'execContainer'; containerId: string }
  | { type: 'requestRefresh' }
  | { type: 'selectComposeService'; projectName: string; serviceName: string | null }
  | { type: 'copyLogs'; text: string };
