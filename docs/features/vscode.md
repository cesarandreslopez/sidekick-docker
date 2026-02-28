# VS Code Extension

The Sidekick Docker extension embeds the Docker dashboard as a webview panel inside your editor. Works with VS Code, VSCodium, and compatible editors.

<p align="center">
  <img src="https://raw.githubusercontent.com/cesarandreslopez/sidekick-docker/main/assets/sidekick_docker_vscode_extension.gif" alt="Sidekick Docker VS Code Extension Demo" width="800">
</p>

## Installation

Install from [Open VSX](https://open-vsx.org/extension/CesarAndresLopez/sidekick-docker-vscode) (recommended for VSCodium and compatible editors) or the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=CesarAndresLopez.sidekick-docker-vscode). You can also search for **Sidekick Docker** in the Extensions view.

## Opening the Dashboard

Open the command palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run:

```
Sidekick Docker: Open Dashboard
```

The dashboard opens as a webview panel with the same layout as the terminal TUI.

## Features

- **Full Docker dashboard** — containers, Compose, images, volumes, networks
- **Real-time updates** — logs and stats stream live inside the editor
- **Container management** — start, stop, restart, remove directly
- **Compose support** — detect and manage projects
- **Log streaming** — stdout/stderr with color coding
- **Stats monitoring** — live CPU and memory metrics

## Requirements

- **VS Code** >= 1.85
- **Docker** running and accessible

## Architecture

The extension uses a webview panel to render the dashboard. The extension host (Node.js) communicates with the webview (browser) via `postMessage()` with a typed message protocol.

Key files:

| File | Role |
|------|------|
| `src/extension.ts` | Activation, command registration |
| `src/providers/DockerDashboardProvider.ts` | Webview lifecycle, Docker API bridge |
| `out/webview/dashboard.js` | Dashboard UI (browser context) |
| `src/types/messages.ts` | Typed request/response messages |

See [Architecture Overview](../architecture/overview.md) for more details.
