# Compose Services Panel

The Compose Services panel (press `2`) shows Docker Compose projects and their services.

## Project Detection

Sidekick Docker discovers Compose projects through two methods:

1. **Container labels** (primary) — reads `com.docker.compose.project` and `com.docker.compose.service` labels from running containers
2. **`docker compose config`** (secondary) — parses compose files to discover services that may not have running containers

These sources are merged to show a complete view: running containers alongside planned-but-not-running services.

## List Layout

Projects appear as collapsible groups. Under each project, individual services are listed with their current state and running/total replica counts. Scaled replicas share one service row; a running replica is preferred as its representative container. A project with only some replicas running has a partial status.

## Detail Tabs

### Info

For a project row: name, status and its service list. For a service row:
service name, project, image, state, replica counts, representative container ID and published ports across its replicas.

### Logs

Streamed logs for the selected project or service, including its replicas. Press `m` to pin a second service for side-by-side log comparison. Both panes update even when only the pinned source produces output.

## Actions

Press `x` on a project or service to open the context menu:

| Key | Action | Description |
|-----|--------|-------------|
| `u` | Up | Start the project (`docker compose up -d`) |
| `D` | Down | Stop the project (`docker compose down`) — asks for confirmation naming the project |
| `r` | Restart | Restart the project or individual service |
| `S` | Stop | Stop the project or individual service |
| `c` | Copy Logs | Copy buffered log text to clipboard |

All compose operations run via the `docker compose` CLI through the `ComposeClient`.

Lifecycle actions use the project's recorded working directory and all files from its `com.docker.compose.project.config_files` label, preserving override order. If a recorded file is missing, the action reports the missing path; restore the file before retrying. Projects discovered from workspace configuration use that workspace as their fallback directory.
