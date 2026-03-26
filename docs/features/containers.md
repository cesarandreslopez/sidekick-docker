# Containers Panel

The Containers panel (press `1`) shows all Docker containers — running and stopped. Press `a` to toggle between showing all containers and only running/paused containers.

## List Columns

Each container row displays:

- State icon (color-coded: green for running, red for stopped, yellow for other)
- Container name
- Port mappings (first exposed port)
- Health status badge (green=healthy, red=unhealthy, yellow=starting) when the container has a health check configured
- Uptime / exit status

## Detail Tabs

Select a container and press `Enter` or `Tab` to view its detail tabs:

### Logs

Live-streamed container logs with token-level syntax highlighting. Individual tokens — HTTP methods, status codes, URLs, IPs, timestamps, JSON keys, state keywords, and file paths — are each colored distinctly, giving you immediate visual parsing of log output. The log buffer holds the most recent 1000 lines.

Logs are selection-driven — streaming starts when you select a container and stops when you navigate away.

**Severity badges** appear in the Logs tab header showing running counts of ERROR, WARN, INFO, and DEBUG lines, each colored by severity level.

**Log filter** — press `f` to open the filter overlay. Type a search query and press `Enter` to filter. Two modes are available (toggle with `Tab`):

- **Exact** — case-insensitive substring match
- **Fuzzy** — all words must appear in the line (AND logic), in any order

Matched text is highlighted and a match count is displayed. Press `Esc` to clear the filter.

**Log compare** — press `m` on a container to pin it as a compare target. When a compare target is pinned and you're viewing the Logs tab, both log streams are displayed side by side in left/right columns. Each column scrolls independently (`j`/`k` for primary, `Shift+J`/`Shift+K` for secondary). Press `m` again on the pinned item to unpin. Each panel remembers its compare target independently.

### Stats

Real-time CPU and memory usage rendered as sparkline charts. The stats collector maintains a 60-sample ring buffer, giving you a rolling view of resource usage.

**Network I/O** — cumulative RX/TX bytes with rate sparklines (bytes/sec) showing transfer activity over time.

**Block I/O** — cumulative read/write bytes with rate sparklines showing disk activity.

**PIDs** — current process count inside the container.

A **log severity sparkline** appears below the resource charts, showing the distribution of log severity over time. Each position is colored by the dominant severity in that time bucket (red for errors, yellow for warnings, blue for info).

Stats are also selection-driven to avoid unnecessary API overhead.

### Env

Environment variables set in the container, displayed as key-value pairs.

### Config

Container configuration details — ID, name, image, state, status, health status (when available), creation time, ports, and Compose project info.

### Files

Shows all filesystem changes made inside the container compared to its base image. Each change is marked with a color-coded indicator:

- **A** (green) — file added
- **C** (yellow) — file changed
- **D** (red) — file deleted

Uses Docker's `container.changes()` API, which works on both running and stopped containers. Changes are fetched once on selection and cached.

### Patterns

Groups similar log lines into templates by replacing variable parts (IDs, IPs, timestamps) with `<*>` wildcards. Templates are ranked by frequency, helping you quickly identify the most common log patterns and spot anomalies.

For example, three lines like `User alice logged in from 192.168.1.1`, `User bob logged in from 10.0.0.1`, and `User charlie logged in from 172.16.0.1` would be grouped into: `User <*> logged in from <*>` (3 occurrences).

## Sorting

Press `o` to open the sort overlay. Sort containers by:

- **State** (default) — running first, then stopped
- **Name** — alphabetical
- **CPU %** — highest CPU usage first
- **Memory %** — highest memory usage first
- **Network I/O** — highest total network bytes first
- **Block I/O** — highest total disk bytes first
- **PIDs** — highest process count first

Use `j`/`k` to navigate, `Enter` to apply, `R` to reverse sort direction. You can also press `R` globally to toggle reverse sort.

## Actions

Press `x` to open the context menu:

| Key | Action | Description |
|-----|--------|-------------|
| `s` | Start | Start a stopped container |
| `S` | Stop | Stop a running container |
| `r` | Restart | Restart a container |
| `p` | Pause | Pause a running container |
| `u` | Unpause | Unpause a paused container |
| `d` | Remove | Remove a container (confirmation required) |
| `e` | Exec | Open an interactive shell inside the container |
| `c` | Copy Logs | Copy buffered log text to clipboard |

### Interactive Exec

The exec action drops you into a shell session inside the container using `node-pty`. It tries bash, then sh, then ash. Press `Ctrl+D` or type `exit` to return to the dashboard.

<p align="center">
  <img src="https://raw.githubusercontent.com/cesarandreslopez/sidekick-docker/main/assets/shell_bash_into_container_cli.gif" alt="Interactive Exec Demo" width="800">
</p>
