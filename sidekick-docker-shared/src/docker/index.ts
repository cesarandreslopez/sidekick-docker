/**
 * Docker Engine API facade module.
 * @see specs/docker/design.md
 */
export { DockerClient, DockerTimeoutError } from './DockerClient';
export type { DockerClientOptions, LogStreamOptions, PingResult, ListResourcesOptions, ResourceListing } from './DockerClient';
export { parseDockerEndpoint, describeDockerEndpoint, dockerCliEnv, defaultDockerSocket } from './endpoint';
