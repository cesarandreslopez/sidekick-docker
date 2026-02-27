# Compose Services Panel

The Compose Services panel (press `2`) shows Docker Compose projects and their services.

## Project Detection

Sidekick Docker discovers Compose projects through two methods:

1. **Container labels** (primary) — reads `com.docker.compose.project` and `com.docker.compose.service` labels from running containers
2. **`docker compose config`** (secondary) — parses compose files to discover services that may not have running containers

These sources are merged to show a complete view: running containers alongside planned-but-not-running services.

## List Layout

Projects appear as collapsible groups. Under each project, individual services are listed with their current state.

## Detail Tabs

### Info

Service configuration details including image, ports, volumes, and environment variables.

### Logs

Streamed logs for the selected service container.

## Actions

Press `x` on a project or service to open the context menu:

| Key | Action | Description |
|-----|--------|-------------|
| `u` | Up | Start the project (`docker compose up -d`) |
| `d` | Down | Stop the project (`docker compose down`) |
| `r` | Restart | Restart the project or individual service |
| `S` | Stop | Stop the project or individual service |

All compose operations run via the `docker compose` CLI through the `ComposeClient`.
