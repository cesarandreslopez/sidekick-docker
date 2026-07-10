export interface ComposeProject {
  name: string;
  /** Directory the project was started from (`com.docker.compose.project.working_dir` label). */
  workingDir?: string;
  configFile?: string;
  services: ComposeService[];
  status: 'running' | 'partial' | 'stopped';
}

export interface ComposeService {
  name: string;
  projectName: string;
  containerId?: string;
  state: 'running' | 'paused' | 'exited' | 'restarting' | 'dead' | 'created' | 'not_created';
  image: string;
  ports: string[];
}
