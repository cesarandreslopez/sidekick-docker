/**
 * Docker Engine API facade module.
 * @see specs/docker/design.md
 */
export { DockerClient } from './DockerClient';
export type { DockerClientOptions, LogStreamOptions, PingResult } from './DockerClient';
export { parseDockerEndpoint, describeDockerEndpoint } from './endpoint';
