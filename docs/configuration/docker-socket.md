# Docker Socket Configuration

By default, Sidekick Docker connects to the Docker daemon via the local Unix socket.

## Default Socket

```
/var/run/docker.sock
```

This is the standard location on Linux and macOS. Docker Desktop also exposes this socket.

## Custom Socket Path

Use the `--socket` flag to specify a different socket:

```bash
sidekick-docker --socket /path/to/docker.sock
```

## TCP Connection

Connect to a remote Docker daemon over TCP:

```bash
sidekick-docker --socket tcp://192.168.1.100:2375
```

!!! warning
    Unencrypted TCP connections expose the Docker API without authentication. Use TLS for production remote connections.

## Environment Variables

The underlying Docker client (dockerode) also respects standard Docker environment variables:

| Variable | Description |
|----------|-------------|
| `DOCKER_HOST` | Docker daemon socket (e.g., `unix:///var/run/docker.sock` or `tcp://host:port`) |
| `DOCKER_TLS_VERIFY` | Enable TLS verification (`1` to enable) |
| `DOCKER_CERT_PATH` | Path to TLS certificates |

The `--socket` flag takes precedence over environment variables.
