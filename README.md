<p align="center">
  <img src="images/icon-128.png" alt="Sidekick Docker" width="128" height="128">
</p>

<h1 align="center">Sidekick Docker</h1>

<p align="center">
  <a href="https://open-vsx.org/extension/CesarAndresLopez/sidekick-docker-vscode"><img src="https://img.shields.io/open-vsx/v/CesarAndresLopez/sidekick-docker-vscode?label=Open%20VSX" alt="Open VSX"></a>
  <a href="https://open-vsx.org/extension/CesarAndresLopez/sidekick-docker-vscode"><img src="https://img.shields.io/open-vsx/dt/CesarAndresLopez/sidekick-docker-vscode?label=Open%20VSX%20Downloads" alt="Open VSX Downloads"></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=CesarAndresLopez.sidekick-docker-vscode"><img src="https://img.shields.io/visual-studio-marketplace/v/CesarAndresLopez.sidekick-docker-vscode?label=VS%20Code%20Marketplace" alt="VS Code Marketplace"></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=CesarAndresLopez.sidekick-docker-vscode"><img src="https://img.shields.io/visual-studio-marketplace/i/CesarAndresLopez.sidekick-docker-vscode?label=VS%20Code%20Installs" alt="VS Code Installs"></a>
  <a href="https://www.npmjs.com/package/sidekick-docker"><img src="https://img.shields.io/npm/v/sidekick-docker?label=npm" alt="npm"></a>
  <a href="https://www.npmjs.com/package/sidekick-docker"><img src="https://img.shields.io/npm/dt/sidekick-docker?label=npm%20Downloads" alt="npm Downloads"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://github.com/cesarandreslopez/sidekick-docker/actions/workflows/ci.yml"><img src="https://github.com/cesarandreslopez/sidekick-docker/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
</p>

<p align="center">
  <strong>Your Docker dashboard, everywhere.</strong> A full-featured Docker management dashboard that runs in your terminal and in VS Code.
</p>

<p align="center">
  <img src="assets/sidekick_docker_cli.gif" alt="Sidekick Docker TUI Demo" width="800">
</p>

<p align="center">
  <img src="assets/sidekick_docker_vscode_extension.gif" alt="Sidekick Docker VS Code Extension Demo" width="800">
</p>

## What is this?

Sidekick Docker gives you a real-time, keyboard-driven dashboard for managing your entire Docker environment — containers, Compose projects, images, volumes, and networks. Run it as a standalone TUI in any terminal, or open it as a panel inside VS Code. Same power, two surfaces.

## Features

- **Real-time streaming** — logs, stats, and Docker events update live as they happen
- **Vi keybindings** — navigate with `j`/`k`, jump with `g`/`G`, switch panels with `1`-`5`
- **Sparkline charts** — CPU and memory usage rendered as inline sparklines in the terminal
- **Compose support** — detect projects from container labels, run `up`/`down`/`restart` per project
- **Interactive exec** — drop into a running container shell without leaving the dashboard
- **Filter & search** — `/` to filter any resource list by name
- **Confirmation modals** — destructive actions (remove, prune) always ask first
- **Mouse support** — click to select, scroll to navigate
- **VS Code extension** — the same dashboard, embedded as a webview panel

## Quick Start

### Terminal (TUI)

```bash
npm install -g sidekick-docker
sidekick-docker
```

### VS Code / VSCodium / Compatible Editors

Install the **Sidekick Docker** extension from [Open VSX](https://open-vsx.org/extension/CesarAndresLopez/sidekick-docker-vscode) or the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=CesarAndresLopez.sidekick-docker-vscode), then run `Sidekick Docker: Open Dashboard` from the command palette.

## Packages

| Package | Description |
|---------|-------------|
| [`sidekick-docker-cli`](sidekick-docker-cli/) | TUI dashboard and CLI commands (Ink + React) |
| [`sidekick-docker-shared`](sidekick-docker-shared/) | Docker API abstraction layer, types, Compose detection |
| [`sidekick-docker-vscode`](sidekick-docker-vscode/) | VS Code extension with embedded dashboard webview |

## Build from Source

```bash
git clone https://github.com/cesarandreslopez/sidekick-docker.git
cd sidekick-docker
bash scripts/build-all.sh
./sidekick-docker-cli/dist/sidekick-docker.mjs
```

Requires **Node.js >= 20** and **Docker** running.

## Documentation

Full documentation is available at the [docs site](https://cesarandreslopez.github.io/sidekick-docker/), including:

- [Getting Started](https://cesarandreslopez.github.io/sidekick-docker/getting-started/installation/)
- [TUI Dashboard](https://cesarandreslopez.github.io/sidekick-docker/features/dashboard/)
- [CLI Commands](https://cesarandreslopez.github.io/sidekick-docker/features/cli-commands/)
- [VS Code Extension](https://cesarandreslopez.github.io/sidekick-docker/features/vscode/)
- [Architecture](https://cesarandreslopez.github.io/sidekick-docker/architecture/overview/)

## See Also

**[Sidekick Agent Hub](https://github.com/cesarandreslopez/sidekick-agent-hub)** — Multi-provider AI coding agent monitor. Real-time visibility into Claude Code, OpenCode, and Codex CLI sessions with token tracking, context management, and session intelligence. Available as a [TUI on npm](https://www.npmjs.com/package/sidekick-agent-hub) and as a VS Code extension on the [Marketplace](https://marketplace.visualstudio.com/items?itemName=CesarAndresLopez.sidekick-for-max) and [Open VSX](https://open-vsx.org/extension/cesarandreslopez/sidekick-for-max).

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions and guidelines.

## License

[MIT](LICENSE)
