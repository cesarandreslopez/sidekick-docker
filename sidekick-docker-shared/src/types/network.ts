export interface NetworkContainerRef {
  containerId: string;
  containerName: string;
  /** Address this container holds on the network, e.g. "172.18.0.3/16". */
  ipv4Address?: string;
  ipv6Address?: string;
  macAddress?: string;
}

/** One address pool configured on a network. */
export interface NetworkIpamConfig {
  subnet?: string;
  gateway?: string;
  ipRange?: string;
}

export interface NetworkInfo {
  id: string;
  name: string;
  driver: string;
  scope: string;
  containers: NetworkContainerRef[];
  isDefault: boolean;
  /** IPAM driver, e.g. "default". */
  ipamDriver?: string;
  /** Address pools. Usually one, but a network can have several. */
  ipam: NetworkIpamConfig[];
  /** No external connectivity. */
  internal: boolean;
  /** Containers may attach manually, not only via services. */
  attachable: boolean;
  labels: Record<string, string>;
}
