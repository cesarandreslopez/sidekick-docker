/** Extract a human-readable message from an unknown error value. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Extract a Node.js errno code (e.g. 'ENOENT', 'EACCES') from an unknown error value. */
export function errorCode(err: unknown): string | undefined {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as NodeJS.ErrnoException).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

/**
 * One-line, actionable explanation of why the Docker daemon is unreachable.
 * `endpoint` should come from describeDockerEndpoint().
 */
export function explainDockerUnreachable(err: unknown, endpoint: string): string {
  switch (errorCode(err)) {
    case 'EACCES':
    case 'EPERM':
      return `Permission denied on ${endpoint}. Add your user to the 'docker' group, or run with elevated permissions.`;
    case 'ENOENT':
      return `Docker socket not found at ${endpoint}. Is Docker installed and running? Point elsewhere with --socket or DOCKER_HOST.`;
    case 'ECONNREFUSED':
      return `Connection refused at ${endpoint}. Is the Docker daemon running?`;
    case 'ETIMEDOUT':
    case 'EHOSTUNREACH':
    case 'ENETUNREACH':
      return `Cannot reach ${endpoint}. Check the host address and your network.`;
    default:
      return `Cannot connect to Docker daemon at ${endpoint} (${errorMessage(err)}). Is Docker running?`;
  }
}
