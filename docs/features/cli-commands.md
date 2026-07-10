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

## Global Options

| Flag | Description |
|------|-------------|
| `--socket <endpoint>` | Docker endpoint: socket path, `unix://` or `tcp://host[:port]` URL (see [Docker Socket](../configuration/docker-socket.md)) |
| `--no-color` | Disable colored output (the `NO_COLOR` env var also disables it; `FORCE_COLOR` forces it on) |
| `--verbose` | Show full error details |
| `--version` | Show version |
| `--help` | Show help |
