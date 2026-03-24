# Sidekick Docker CLI

[![npm](https://img.shields.io/npm/v/sidekick-docker?label=npm)](https://www.npmjs.com/package/sidekick-docker)
[![npm Downloads](https://img.shields.io/npm/dt/sidekick-docker?label=Downloads)](https://www.npmjs.com/package/sidekick-docker)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/cesarandreslopez/sidekick-docker/blob/main/LICENSE)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/cesarandreslopez/sidekick-docker)

A terminal dashboard for Docker. Manage containers, Compose projects, images, volumes, and networks — all from a single, keyboard-driven TUI.

<p align="center">
  <img src="../assets/sidekick_docker_cli.gif" alt="Sidekick Docker CLI Demo" width="800">
</p>

## Install

```bash
npm install -g sidekick-docker
```

**Prerequisites:** Node.js >= 20, Docker running.

## Usage

```bash
# Launch the interactive dashboard
sidekick-docker

# List containers (non-interactive)
sidekick-docker ps
sidekick-docker ps --all

# Stream container logs
sidekick-docker logs <container>
sidekick-docker logs <container> --tail 50
```

### Options

| Flag | Description |
|------|-------------|
| `--socket <path>` | Custom Docker socket path |
| `--version` | Show version |
| `--help` | Show help |

## Dashboard

The dashboard has 5 panels, each mapped to a number key:

| # | Panel | Shows | Detail Tabs |
|---|-------|-------|-------------|
| 1 | **Containers** | All containers with state, image, ports, uptime | Logs, Stats, Env, Config, Files, Patterns |
| 2 | **Services** | Compose projects and their services | Info, Logs |
| 3 | **Images** | Local images with tags, size, age | Info, Layers |
| 4 | **Volumes** | Named volumes with driver, mount path, usage status | Info |
| 5 | **Networks** | Docker networks with driver, scope, connected containers | Info |

## Keybindings

### Navigation

| Key | Action |
|-----|--------|
| `j` / `Down` | Move down |
| `k` / `Up` | Move up |
| `g` | Jump to top |
| `G` | Jump to bottom |
| `Tab` | Toggle focus between side list and detail pane |
| `Enter` | Focus detail pane |
| `Esc` | Back to side list / close overlay / clear filter |
| `h` / `Left` | Back to side list (when in detail pane) |

### Panels & Tabs

| Key | Action |
|-----|--------|
| `1`-`5` | Switch to panel |
| `[` / `]` | Cycle detail tab left / right |

### Actions

| Key | Action |
|-----|--------|
| `x` | Open context menu (actions for selected item) |
| `f` | Open log filter (when on Logs tab) |
| `/` | Open filter |
| `z` | Toggle expanded layout |
| `?` | Show help overlay |
| `V` | Show version |
| `q` / `Ctrl+C` | Quit |

### Container Actions (via context menu)

| Key | Action |
|-----|--------|
| `s` | Start |
| `S` | Stop |
| `r` | Restart |
| `R` | Remove (with confirmation) |
| `e` | Exec into container |
| `c` | Copy logs to clipboard |

### Compose Actions (via context menu)

| Key | Action |
|-----|--------|
| `u` | Up (start project) |
| `d` | Down (stop project) |
| `r` | Restart |
| `S` | Stop |
| `c` | Copy logs to clipboard |

## Features

- **Real-time log streaming** — follows container logs with token-level syntax highlighting (HTTP methods, status codes, URLs, IPs, timestamps, JSON keys)
- **Log search & filter** — press `f` on the Logs tab to search within log output with exact or fuzzy matching and match highlighting
- **Log analytics** — severity count badges, severity sparkline over time, and pattern clustering that groups similar logs into templates with `<*>` wildcards
- **Live stats with sparklines** — CPU, memory, network I/O, block I/O, and log severity charted as inline sparklines (60-sample history)
- **Filesystem inspector** — view all filesystem changes inside containers (added/changed/deleted files)
- **Image layer explorer** — inspect image layer history with sizes and Dockerfile instructions
- **Interactive exec** — open a shell inside any running container
- **Compose detection** — automatically discovers projects from container labels, merges with compose file config
- **Filter** — press `/` to filter any list by name
- **Confirmation modals** — destructive actions always ask before executing
- **Mouse support** — click items to select, scroll to navigate
- **Toast notifications** — non-blocking feedback for actions

## Configuration

### Custom Docker Socket

```bash
sidekick-docker --socket /var/run/docker.sock
sidekick-docker --socket tcp://192.168.1.100:2375
```

## Documentation

Full documentation is available at the [docs site](https://cesarandreslopez.github.io/sidekick-docker/).

## See Also

**[Sidekick Agent Hub](https://github.com/cesarandreslopez/sidekick-agent-hub)** — Multi-provider AI coding agent monitor. Real-time visibility into Claude Code, OpenCode, and Codex CLI sessions with token tracking, context management, and session intelligence. Available as a [TUI on npm](https://www.npmjs.com/package/sidekick-agent-hub) and a [VS Code extension](https://marketplace.visualstudio.com/items?itemName=CesarAndresLopez.sidekick-for-max).

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](../CONTRIBUTING.md) for setup instructions and guidelines.

## License

[MIT](../LICENSE)
