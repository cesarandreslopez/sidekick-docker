import {
  DockerClient,
  parseDockerEndpoint,
  describeDockerEndpoint,
  explainDockerUnreachable,
} from 'sidekick-docker-shared';

/**
 * Printed when the default endpoint is unreachable. Colima, OrbStack, Podman
 * and rootless Docker are usually selected with `docker context use`, which
 * sidekick-docker does not read — the docker CLI worked while this failed,
 * with nothing saying why.
 */
export const DOCKER_CONTEXT_HINT =
  'Hint: sidekick-docker does not read docker contexts. If `docker context ls` shows another endpoint, pass it with --socket or DOCKER_HOST.';

/**
 * Build a DockerClient from the global --socket option and verify the daemon
 * is reachable. Without --socket, docker-modem honors DOCKER_HOST and falls
 * back to the default socket. On failure prints an actionable one-liner (plus
 * the docker-context hint when no endpoint was given, and the raw error with
 * --verbose) and exits 1.
 */
export async function connectOrExit(globalOpts: { socket?: string; verbose?: boolean }): Promise<DockerClient> {
  const client = new DockerClient(globalOpts.socket ? parseDockerEndpoint(globalOpts.socket) : undefined);

  const result = await client.pingDetailed();
  if (!result.ok) {
    console.error(`Error: ${explainDockerUnreachable(result.error, describeDockerEndpoint(globalOpts.socket), '--socket or DOCKER_HOST')}`);
    const endpointGiven = Boolean(globalOpts.socket?.trim() || process.env.DOCKER_HOST?.trim());
    if (!endpointGiven) console.error(DOCKER_CONTEXT_HINT);
    if (globalOpts.verbose) console.error(result.error);
    process.exit(1);
  }

  return client;
}
