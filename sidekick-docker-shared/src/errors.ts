// docker-modem words every failed API call as
// "(HTTP code 409) unexpected - <daemon message> " — the daemon's own message
// is the part a person can act on.
const MODEM_PREFIX = /^\(HTTP code \d+\) ([^-]*?) - ([\s\S]*)$/;

/**
 * Extract a human-readable message from an unknown error value. Docker API
 * failures lose docker-modem's "(HTTP code N) reason - " wrapper, so a toast
 * reads "Failed to start web: container already started" rather than the raw
 * transport text.
 */
export function errorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const m = MODEM_PREFIX.exec(raw);
  if (!m) return raw;
  const body = m[2].trim();
  return body && body !== '[object Object]' ? body : m[1].trim() || raw.trim();
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
 * `endpoint` should come from describeDockerEndpoint(). `pointElsewhere` names
 * how *this* surface selects another endpoint — the CLI's `--socket` flag or
 * the VS Code setting — so neither inherits the other's advice.
 */
export function explainDockerUnreachable(err: unknown, endpoint: string, pointElsewhere: string): string {
  switch (errorCode(err)) {
    case 'EACCES':
    case 'EPERM':
      return `Permission denied on ${endpoint}. Add your user to the 'docker' group, or run with elevated permissions.`;
    case 'ENOENT':
      return `Docker socket not found at ${endpoint}. Is Docker installed and running? Point elsewhere with ${pointElsewhere}.`;
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
