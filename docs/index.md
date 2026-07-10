# Sidekick Docker

<p align="center">
  <img src="https://raw.githubusercontent.com/cesarandreslopez/sidekick-docker/main/assets/social_preview.png" alt="Sidekick for Docker" width="640">
</p>

<p align="center">
  <strong>Your Docker dashboard, everywhere.</strong>
</p>

<p align="center">
  <a href="https://open-vsx.org/extension/CesarAndresLopez/sidekick-docker-vscode"><img src="https://img.shields.io/open-vsx/v/CesarAndresLopez/sidekick-docker-vscode?label=Open%20VSX" alt="Open VSX"></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=CesarAndresLopez.sidekick-docker-vscode"><img src="https://img.shields.io/visual-studio-marketplace/v/CesarAndresLopez.sidekick-docker-vscode?label=VS%20Code" alt="VS Code Marketplace"></a>
  <a href="https://www.npmjs.com/package/sidekick-docker"><img src="https://img.shields.io/npm/v/sidekick-docker?label=npm" alt="npm"></a>
  <a href="https://github.com/cesarandreslopez/sidekick-docker/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://github.com/cesarandreslopez/sidekick-docker/actions/workflows/ci.yml"><img src="https://github.com/cesarandreslopez/sidekick-docker/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://deepwiki.com/cesarandreslopez/sidekick-docker"><img src="https://deepwiki.com/badge.svg" alt="Ask DeepWiki"></a>
</p>

---

A full-featured Docker management dashboard that runs in your terminal and in VS Code. Manage containers, Compose projects, images, volumes, and networks from a real-time, keyboard-driven interface.

<p align="center">
  <img src="https://raw.githubusercontent.com/cesarandreslopez/sidekick-docker/main/assets/sidekick_docker_cli.gif" alt="Sidekick Docker TUI Demo" width="800">
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/cesarandreslopez/sidekick-docker/main/assets/sidekick_docker_vscode_extension.gif" alt="Sidekick Docker VS Code Extension Demo" width="800">
</p>

## Feature Highlights

- **Five-panel dashboard** — Containers, Compose Services, Images, Volumes, Networks
- **Real-time streaming** — logs, stats sparklines, and Docker events update live
- **Smart log highlighting** — token-level syntax coloring for HTTP methods, status codes, URLs, IPs, timestamps, JSON keys, and more
- **Log search & filter** — search within log output with exact or fuzzy matching and match highlighting
- **Log analytics** — severity counts, severity sparkline over time, and pattern clustering that groups similar logs into templates
- **Health status tracking** — shows healthy/unhealthy/starting badges for containers with health checks
- **Full container lifecycle** — start, stop, restart, pause, unpause, remove, exec
- **Container sorting** — sort by state, name, CPU, memory, network I/O, block I/O, or PIDs with reverse toggle
- **Show all / running toggle** — filter container list to running-only with a single keypress
- **Filesystem inspector** — view all filesystem changes inside containers (added/changed/deleted files)
- **Image layer explorer** — inspect image layer history with sizes and Dockerfile instructions
- **Network & block I/O sparklines** — rate-based sparklines for network and disk activity
- **Vi keybindings** — `j`/`k` navigation, `g`/`G` jump, `1`-`5` panel switching, `PgUp`/`PgDn` and `Ctrl+D`/`Ctrl+U` paging
- **Compose support** — automatic project detection, per-project actions
- **Interactive exec** — shell into running containers without leaving the dashboard
- **Filter & search** — `/` to filter any resource list
- **Mouse support** — click to select, scroll to navigate, right-click for the actions menu
- **Scriptable CLI** — `ps --format json`, `ps -q`, and `logs --no-follow` for scripts and pipes, with `--no-color`/`NO_COLOR` support
- **Flexible endpoints** — `--socket` accepts a socket path, `unix://` URL, or `tcp://host:port` for remote daemons
- **VS Code extension** — the same dashboard, embedded as a webview panel (works in VS Code, VSCodium, and compatible editors)

## Quick Install

### Terminal (TUI)

```bash
npm install -g sidekick-docker
sidekick-docker
```

### VS Code / VSCodium / Compatible Editors

Install the **Sidekick Docker** extension from [Open VSX](https://open-vsx.org/extension/CesarAndresLopez/sidekick-docker-vscode) or the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=CesarAndresLopez.sidekick-docker-vscode), then run `Sidekick Docker: Open Dashboard` from the command palette (or press `Ctrl+Alt+D`).

## See Also

**[Sidekick Agent Hub](https://github.com/cesarandreslopez/sidekick-agent-hub)** — Multi-provider AI coding agent monitor. Real-time visibility into Claude Code, OpenCode, and Codex CLI sessions with token tracking, context management, and session intelligence. Available as a [TUI on npm](https://www.npmjs.com/package/sidekick-agent-hub) and as a VS Code extension on the [Marketplace](https://marketplace.visualstudio.com/items?itemName=CesarAndresLopez.sidekick-for-max) and [Open VSX](https://open-vsx.org/extension/cesarandreslopez/sidekick-for-max).

## Next Steps

- [Installation](getting-started/installation.md) — all install methods
- [Quick Start](getting-started/quick-start.md) — first-run walkthrough
- [Keybindings](features/keybindings.md) — full keyboard reference
- [Architecture](architecture/overview.md) — how it all fits together
