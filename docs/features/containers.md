# Containers Panel

The Containers panel (press `1`) shows all Docker containers — running and stopped.

## List Columns

Each container row displays:

- State icon (color-coded: green for running, red for stopped, yellow for other)
- Container name
- Image
- Port mappings
- Uptime / exit status

## Detail Tabs

Select a container and press `Enter` or `Tab` to view its detail tabs:

### Logs

Live-streamed container logs with stdout/stderr differentiation. The log buffer holds the most recent 1000 lines.

Logs are selection-driven — streaming starts when you select a container and stops when you navigate away.

### Stats

Real-time CPU and memory usage rendered as sparkline charts. The stats collector maintains a 60-sample ring buffer, giving you a rolling view of resource usage.

Stats are also selection-driven to avoid unnecessary API overhead.

### Env

Environment variables set in the container, displayed as key-value pairs.

### Config

Container configuration details from `docker inspect` — image, command, entry point, network settings, mounts, and labels.

## Actions

Press `x` to open the context menu:

| Key | Action | Description |
|-----|--------|-------------|
| `s` | Start | Start a stopped container |
| `S` | Stop | Stop a running container |
| `r` | Restart | Restart a container |
| `R` | Remove | Remove a container (confirmation required) |
| `e` | Exec | Open an interactive shell inside the container |

### Interactive Exec

The exec action drops you into a shell session inside the container using `node-pty`. It tries bash, then sh, then ash. Press `Ctrl+D` or type `exit` to return to the dashboard.

<p align="center">
  <img src="https://raw.githubusercontent.com/cesarandreslopez/sidekick-docker/main/assets/shell_bash_into_container_cli.gif" alt="Interactive Exec Demo" width="800">
</p>
