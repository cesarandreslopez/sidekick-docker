export type DockerResourceType = 'container' | 'image' | 'volume' | 'network' | 'daemon';

export interface DockerEvent {
  type: string;
  resourceType: DockerResourceType;
  resourceId: string;
  timestamp: Date;
  attributes: Record<string, string>;
}
