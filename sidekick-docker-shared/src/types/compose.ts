export interface ComposeProject {
  name: string;
  /** Directory the project was started from (`com.docker.compose.project.working_dir` label). */
  workingDir?: string;
  configFile?: string;
  /** Original Compose files, in override order. */
  configFiles?: string[];
  services: ComposeService[];
  status: 'running' | 'partial' | 'stopped';
}

export interface ComposeReplica {
  containerId: string;
  state: ComposeService['state'];
  image: string;
  ports: string[];
}

export interface ComposeService {
  name: string;
  projectName: string;
  containerId?: string;
  replicas?: ComposeReplica[];
  runningReplicas?: number;
  totalReplicas?: number;
  state: 'running' | 'paused' | 'exited' | 'restarting' | 'dead' | 'created' | 'not_created';
  image: string;
  ports: string[];
}
