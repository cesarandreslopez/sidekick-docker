# Docker Socket Configuration

By default, Sidekick Docker connects to the Docker daemon via the local Unix socket.

## Default Socket

```
/var/run/docker.sock
```

This is the standard location on Linux and macOS. Docker Desktop also exposes this socket.

## Custom Endpoint

Use the `--socket` flag to specify a different endpoint. It accepts a plain socket path, a `unix://` URL, or a `tcp://` (also `http://`/`https://`) URL:

```bash
sidekick-docker --socket /path/to/docker.sock
sidekick-docker --socket unix:///run/user/1000/docker.sock
sidekick-docker --socket tcp://192.168.1.100:2375
```

For TCP endpoints the port defaults to 2375 (2376 for `https://`). TLS is enabled for `https://` URLs and for the scheme-ambiguous `tcp://` form on port 2376; an explicit `http://` endpoint stays plain HTTP regardless of port.

The endpoint applies to everything the dashboard does, including Compose actions — `docker compose up`/`down`/`restart` run against the same daemon (via `DOCKER_HOST`).

## TCP Connection

Connect to a remote Docker daemon over TCP:

```bash
sidekick-docker --socket tcp://192.168.1.100:2375
```

!!! warning
    Unencrypted TCP connections expose the Docker API without authentication. Use TLS for production remote connections.

## VS Code Extension

The VS Code extension reads the same endpoint formats from the `sidekick-docker.socketPath` setting (Settings → Extensions → Sidekick Docker):

```json
{
  "sidekick-docker.socketPath": "tcp://192.168.1.100:2375"
}
```

Leave it empty to use the platform default socket (or `DOCKER_HOST` if set). An invalid value is ignored with a warning and the default socket is used. Changes apply immediately — the extension reconnects without a window reload.

## Environment Variables

The underlying Docker client (dockerode) also respects standard Docker environment variables:

| Variable | Description |
|----------|-------------|
| `DOCKER_HOST` | Docker daemon endpoint (e.g., `unix:///var/run/docker.sock`, `tcp://host:port`, or `ssh://user@host`) |
| `DOCKER_TLS_VERIFY` | Enable TLS verification (`1` to enable) |
| `DOCKER_CERT_PATH` | Path to TLS certificates |

The `--socket` flag takes precedence over environment variables — an explicit `--socket` socket path wins even when `DOCKER_HOST` is set.
