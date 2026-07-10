import {
  DockerClient,
  parseDockerEndpoint,
  describeDockerEndpoint,
  explainDockerUnreachable,
} from 'sidekick-docker-shared';

/**
 * Build a DockerClient from the global --socket option and verify the daemon
 * is reachable. Without --socket, docker-modem honors DOCKER_HOST and falls
 * back to the default socket. On failure prints an actionable one-liner and
 * exits 1.
 */
export async function connectOrExit(globalOpts: { socket?: string }): Promise<DockerClient> {
  const client = new DockerClient(globalOpts.socket ? parseDockerEndpoint(globalOpts.socket) : undefined);

  const result = await client.pingDetailed();
  if (!result.ok) {
    console.error(`Error: ${explainDockerUnreachable(result.error, describeDockerEndpoint(globalOpts.socket))}`);
    process.exit(1);
  }

  return client;
}
