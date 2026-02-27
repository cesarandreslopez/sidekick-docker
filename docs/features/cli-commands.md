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
```

## `sidekick-docker logs`

Stream logs from a container.

```bash
# Stream logs (follows by default)
sidekick-docker logs <container>

# Last 50 lines
sidekick-docker logs <container> --tail 50
```

## Global Options

| Flag | Description |
|------|-------------|
| `--socket <path>` | Custom Docker socket path (see [Docker Socket](../configuration/docker-socket.md)) |
| `--version` | Show version |
| `--help` | Show help |
