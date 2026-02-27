export interface ComposeProject {
  name: string;
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
