export interface NetworkContainerRef {
  containerId: string;
  containerName: string;
}

export interface NetworkInfo {
  id: string;
  name: string;
  driver: string;
  scope: string;
  containers: NetworkContainerRef[];
  isDefault: boolean;
}
