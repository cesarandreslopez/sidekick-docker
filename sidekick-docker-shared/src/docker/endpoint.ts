import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { DockerClientOptions } from './DockerClient';

const DEFAULT_TCP_PORT = 2375;
const DEFAULT_TLS_PORT = 2376;
const DEFAULT_SOCKET = '/var/run/docker.sock';

/**
 * Parse a user-supplied Docker endpoint into DockerClientOptions.
 *
 * Accepted forms:
 * - bare filesystem path (`/var/run/docker.sock`, `\\.\pipe\docker_engine`)
 * - `unix:///path/to/socket`
 * - `tcp://host[:port]`, `http://host[:port]`, `https://host[:port]`
 *
 * Protocol is `https` iff the scheme is `https://`, or the scheme-ambiguous
 * `tcp://` is used with the conventional TLS port 2376. An explicit `http://`
 * always stays plain HTTP.
 */
export function parseDockerEndpoint(value: string): DockerClientOptions {
  const trimmed = value.trim();
  if (trimmed === '') {
    throw new Error('Docker endpoint must not be empty');
  }

  if (trimmed.startsWith('unix://')) {
    const socketPath = trimmed.slice('unix://'.length);
    if (socketPath === '') {
      throw new Error(`Invalid Docker endpoint "${value}": missing socket path`);
    }
    return { socketPath };
  }

  const schemeMatch = /^(tcp|http|https):\/\//.exec(trimmed);
  if (schemeMatch) {
    const scheme = schemeMatch[1];
    let url: URL;
    try {
      // URL cannot parse tcp://; normalize the scheme for parsing only.
      url = new URL(trimmed.replace(/^tcp:\/\//, 'http://'));
    } catch {
      throw new Error(`Invalid Docker endpoint "${value}"`);
    }
    if (!url.hostname) {
      throw new Error(`Invalid Docker endpoint "${value}": missing host`);
    }
    const port = url.port
      ? Number(url.port)
      : scheme === 'https' ? DEFAULT_TLS_PORT : DEFAULT_TCP_PORT;
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      throw new Error(`Invalid Docker endpoint "${value}": bad port`);
    }
    const protocol = scheme === 'https' || (scheme === 'tcp' && port === DEFAULT_TLS_PORT) ? 'https' : 'http';
    return { host: url.hostname, port, protocol };
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    throw new Error(`Invalid Docker endpoint "${value}": unsupported scheme (use a path, unix://, or tcp://)`);
  }

  return { socketPath: trimmed };
}

/**
 * Environment overrides that make a spawned `docker` CLI (e.g. `docker
 * compose`) target the same endpoint as an API client built from
 * `parseDockerEndpoint(value)`. Without this, spawned CLI processes inherit
 * the ambient DOCKER_HOST (or the default socket) and mutating compose
 * actions land on a different daemon than the one the UI shows.
 */
export function dockerCliEnv(value: string): Record<string, string> {
  const opts = parseDockerEndpoint(value);
  if (opts.socketPath) {
    // The docker CLI wants npipe:////./pipe/name for Windows named pipes.
    return opts.socketPath.startsWith('\\\\.\\pipe\\')
      ? { DOCKER_HOST: `npipe://${opts.socketPath.replace(/\\/g, '/')}` }
      : { DOCKER_HOST: `unix://${opts.socketPath}` };
  }
  const env: Record<string, string> = { DOCKER_HOST: `tcp://${opts.host}:${opts.port}` };
  // tcp:// is plain HTTP to the docker CLI unless TLS verification is on.
  if (opts.protocol === 'https') env.DOCKER_TLS_VERIFY = '1';
  return env;
}

/**
 * The socket docker-modem connects to when neither an endpoint nor DOCKER_HOST
 * is given: the Windows named pipe, Docker Desktop's per-user socket when it
 * exists, else the system socket (mirrors docker-modem's `defaultOpts`).
 */
export function defaultDockerSocket(
  platform: NodeJS.Platform = process.platform,
  home: string = homedir(),
  exists: (path: string) => boolean = existsSync,
): string {
  if (platform === 'win32') return '//./pipe/docker_engine';
  const userSocket = join(home, '.docker', 'run', 'docker.sock');
  return exists(userSocket) ? userSocket : DEFAULT_SOCKET;
}

/**
 * Human-readable description of which endpoint a connection attempt used,
 * for error messages ("Cannot connect to Docker daemon at <endpoint>").
 * The default used to always read /var/run/docker.sock, even on Windows or
 * when the client was actually using Docker Desktop's per-user socket.
 */
export function describeDockerEndpoint(value?: string): string {
  if (value && value.trim() !== '') return value.trim();
  const envHost = process.env.DOCKER_HOST;
  if (envHost && envHost.trim() !== '') return `${envHost.trim()} (from DOCKER_HOST)`;
  return `the default Docker socket (${defaultDockerSocket()})`;
}
