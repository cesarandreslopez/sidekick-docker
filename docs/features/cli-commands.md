# CLI Commands

In addition to the interactive dashboard, Sidekick Docker provides non-interactive CLI commands for scripting and quick lookups.

## `sidekick-docker` (no arguments)

Launches the interactive TUI dashboard. See [Dashboard Overview](dashboard.md).

## `sidekick-docker ps`

List containers in a table format.

```bash
# Running containers only (default)
sidekick-docker ps

# All containers (including stopped)
sidekick-docker ps --all

# Machine-readable JSON
sidekick-docker ps --format json

# Container IDs only (overrides --format)
sidekick-docker ps -q
```

| Flag | Description |
|------|-------------|
| `-a`, `--all` | Show all containers (default: running only) |
| `--format <table\|json>` | Output format (default: `table`) |
| `-q`, `--quiet` | Only print container IDs |

## `sidekick-docker logs`

Stream logs from a container.

```bash
# Follows when attached to a terminal; prints and exits when piped
sidekick-docker logs <container>

# Explicitly follow / don't follow
sidekick-docker logs <container> --follow
sidekick-docker logs <container> --no-follow

# Last 50 lines (default: 100)
sidekick-docker logs <container> --tail 50
```

| Flag | Description |
|------|-------------|
| `-f`, `--follow` | Follow log output (default when attached to a terminal) |
| `--no-follow` | Print logs and exit |
| `-n`, `--tail <lines>` | Number of lines to show from the end (default: 100) |

## `sidekick-docker images`

Lists local images.

```bash
sidekick-docker images                 # table
sidekick-docker images --all           # include intermediate layers
sidekick-docker images -q              # IDs only, for piping
sidekick-docker images --format json
```

## `sidekick-docker volumes`

Lists named volumes, including which containers currently mount each one.

```bash
sidekick-docker volumes
sidekick-docker volumes --format json
```

## `sidekick-docker networks`

Lists networks with their subnet and attached-container count.

```bash
sidekick-docker networks
sidekick-docker networks --format json
```

## `sidekick-docker stats`

One-shot resource usage for every running container, like
`docker stats --no-stream`. It samples and exits rather than streaming, so it
composes in scripts and pipelines.

```bash
sidekick-docker stats
sidekick-docker stats --format json
```

## `sidekick-docker df`

Aggregate disk usage, equivalent to `docker system df`. This is the only place
build cache is reported, and it is frequently the largest consumer.

```bash
sidekick-docker df
sidekick-docker df --format json
```

## `sidekick-docker inspect`

Prints the raw inspect payload for a container as JSON — mounts, restart
policy, resource limits and health history, none of which the curated detail
tabs show. Accepts a name, a full ID, or an ID prefix.

```bash
sidekick-docker inspect web
sidekick-docker inspect web | jq .State.Health
```

Exits non-zero when no container matches.

## Global Options

| Flag | Description |
|------|-------------|
| `--socket <endpoint>` | Docker endpoint: socket path, `unix://` or `tcp://host[:port]` URL (see [Docker Socket](../configuration/docker-socket.md)) |
| `--no-color` | Disable colored output (the `NO_COLOR` env var also disables it; `FORCE_COLOR` forces it on) |
| `--verbose` | Show full error details |
| `--version` | Show version |
| `--help` | Show help |
