# Sidekick Docker for VS Code

[![Open VSX](https://img.shields.io/open-vsx/v/CesarAndresLopez/sidekick-docker-vscode?label=Open%20VSX)](https://open-vsx.org/extension/CesarAndresLopez/sidekick-docker-vscode)
[![Open VSX Downloads](https://img.shields.io/open-vsx/dt/CesarAndresLopez/sidekick-docker-vscode?label=Open%20VSX%20Downloads)](https://open-vsx.org/extension/CesarAndresLopez/sidekick-docker-vscode)
[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/CesarAndresLopez.sidekick-docker-vscode?label=VS%20Code%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=CesarAndresLopez.sidekick-docker-vscode)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/cesarandreslopez/sidekick-docker/blob/main/LICENSE)

A Docker management dashboard embedded directly in VS Code, VSCodium, and compatible editors. Manage containers, Compose projects, images, volumes, and networks without leaving your editor.

<p align="center">
  <img src="https://raw.githubusercontent.com/cesarandreslopez/sidekick-docker/main/assets/sidekick_docker_vscode_extension.gif" alt="Sidekick Docker VS Code Extension Demo" width="800">
</p>

## Install

### From VSIX

```bash
cd sidekick-docker-vscode
npm install
npm run build
code --install-extension sidekick-docker-vscode-0.1.0.vsix
```

### Build from Source

```bash
git clone https://github.com/cesarandreslopez/sidekick-docker.git
cd sidekick-docker
bash scripts/build-all.sh
```

Then open the `sidekick-docker-vscode` folder in VSCode and press `F5` to launch the Extension Development Host.

## Usage

Open the command palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run:

```
Sidekick Docker: Open Dashboard
```

The dashboard opens as a webview panel with the same layout and capabilities as the terminal TUI.

## Features

- **Full Docker dashboard in VSCode** — containers, Compose, images, volumes, networks
- **Real-time updates** — logs and stats stream live inside the editor
- **Container management** — start, stop, restart, remove containers directly
- **Compose support** — detect and manage Compose projects
- **Log streaming** — view stdout/stderr with color coding
- **Stats monitoring** — live CPU and memory metrics

## Requirements

- **VSCode** >= 1.85
- **Docker** running and accessible
- **Node.js** >= 20 (for building from source)

## Architecture

The extension uses a webview panel to render the dashboard UI. The extension host (Node.js) communicates with the webview (browser) via `postMessage()` with a typed message protocol:

- **Extension side** (`src/extension.ts`) — activates on command, creates the `DockerDashboardProvider`
- **Provider** (`src/providers/DockerDashboardProvider.ts`) — manages the webview lifecycle, handles Docker API calls via `sidekick-docker-shared`
- **Webview** (`out/webview/dashboard.js`) — renders the dashboard UI, sends user actions back to the extension
- **Message types** (`src/types/messages.ts`) — typed request/response messages between extension and webview

## Documentation

Full documentation is available at the [docs site](https://cesarandreslopez.github.io/sidekick-docker/).

## See Also

**[Sidekick Agent Hub](https://github.com/cesarandreslopez/sidekick-agent-hub)** — Multi-provider AI coding agent monitor. Real-time visibility into Claude Code, OpenCode, and Codex CLI sessions with token tracking, context management, and session intelligence. Available as a [TUI on npm](https://www.npmjs.com/package/sidekick-agent-hub) and a [VS Code extension](https://marketplace.visualstudio.com/items?itemName=CesarAndresLopez.sidekick-for-max).

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](../CONTRIBUTING.md) for setup instructions and guidelines.

## License

[MIT](../LICENSE)
