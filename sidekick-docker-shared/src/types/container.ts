export interface PortBinding {
  hostIp: string;
  hostPort: number;
  containerPort: number;
  protocol: 'tcp' | 'udp';
}

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  state: 'running' | 'paused' | 'restarting' | 'exited' | 'dead' | 'created' | 'removing';
  status: string;
  ports: PortBinding[];
  created: Date;
  composeProject?: string;
  composeService?: string;
  healthStatus?: 'healthy' | 'unhealthy' | 'starting';
  /** Raw Docker labels, when the producer threads them through (optional). */
  labels?: Record<string, string>;
}

export interface ContainerStats {
  cpuPercent: number;
  memoryUsage: number;
  memoryLimit: number;
  memoryPercent: number;
  networkRx: number;
  networkTx: number;
  blockRead: number;
  blockWrite: number;
  pids: number;
  timestamp: Date;
}

export interface ContainerStatsHistory {
  containerId: string;
  samples: ContainerStats[];
  maxSamples: number;
}

export interface LogEntry {
  timestamp: Date | null;
  stream: 'stdout' | 'stderr';
  message: string;
}

export interface ContainerMount {
  type: string;
  /** Volume name for named volumes. */
  name?: string;
  source: string;
  destination: string;
  readOnly: boolean;
}

export interface HealthCheckResult {
  start: Date | null;
  exitCode: number;
  output: string;
}

/** Inspect-only details for the Config tab (one `inspect` call, cached per container). */
export interface ContainerDetails {
  env: string[];
  restartPolicy: { name: string; maximumRetryCount: number };
  restartCount: number;
  mounts: ContainerMount[];
  exitCode: number;
  oomKilled: boolean;
  /** Daemon-reported error (e.g. why the container failed to start). */
  error: string;
  health: { status: string; failingStreak: number; log: HealthCheckResult[] } | null;
}

export interface FilesystemChange {
  path: string;
  kind: 'added' | 'changed' | 'deleted';
}
