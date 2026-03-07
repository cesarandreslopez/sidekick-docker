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
