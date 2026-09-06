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

or press `Ctrl+Alt+D` — `Ctrl`, not `Cmd`, on macOS too (macOS reserves `Cmd+Opt+D` for the Dock). The dashboard opens as a webview panel with the same layout as the terminal TUI. The dashboard panel survives window reloads.

## Commands

| Command | Description |
|---------|-------------|
| `Sidekick Docker: Open Dashboard` | Open the dashboard (`Ctrl+Alt+D`, all platforms) |
| `Sidekick Docker: Open Dashboard to the Side` | Open in a split editor column |
| `Sidekick Docker: Refresh Containers` | Refresh the tree view (`Ctrl+Alt+R` / `Cmd+Alt+R` when the Containers view is focused) |
| `Sidekick Docker: Start/Stop/Restart Container...` | Quick-pick a container to act on |
| `Sidekick Docker: Exec into Container...` | Quick-pick a running container and open a terminal inside it, using `sidekick-docker.exec.defaultShell` |
| `Sidekick Docker: Show Container Logs...` | Quick-pick a container and open the dashboard on its logs |

## Containers Tree View

The activity-bar **Containers** view groups containers by state (and by Compose project), with start/stop/restart/pause/unpause/remove and "Open in Dashboard" in the context menu. A status-bar item shows running/total counts and opens the dashboard on click. When the Docker daemon is unreachable, the view offers a **Retry Connection** action.

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `sidekick-docker.socketPath` | `""` | Docker endpoint: socket path, `unix://`, or `tcp://host[:port]`. Empty uses the platform default (or `DOCKER_HOST`). |
| `sidekick-docker.refreshIntervalSeconds` | `30` | Fallback full-refresh interval in seconds (minimum 5). |
| `sidekick-docker.statusBar.visible` | `true` | Show the status-bar container counts. |
| `sidekick-docker.exec.defaultShell` | `/bin/sh` | Shell used when opening an exec terminal into a container. |

Settings apply immediately — the extension reconnects without a window reload.

## Features

- **Full Docker dashboard** — containers, Compose, images, volumes, networks
- **Real-time updates** — logs and stats stream live inside the editor
- **Smart log highlighting** — token-level syntax coloring for HTTP methods, status codes, URLs, IPs, timestamps, JSON keys, and more
- **Log search & filter** — search within log output with exact or fuzzy matching and match highlighting
- **Log analytics** — severity count badges and pattern clustering that groups similar logs into templates
- **Container management** — start, stop, restart, pause, unpause, remove directly
- **Health status** — shows healthy/unhealthy/starting indicators for containers with health checks
- **Compose support** — detect and manage projects
- **Stats monitoring** — live CPU, memory, network I/O, and block I/O metrics with sparkline charts
- **Filesystem inspector** — view all filesystem changes inside containers (Files tab)
- **Image layer explorer** — inspect image layer history with sizes and Dockerfile instructions (Layers tab)

## Requirements

- **VS Code** >= 1.109
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

## Keyboard focus and recovery

Use Tab and Shift+Tab to move between webview controls. The terminal dashboard keeps its own Tab focus toggle. Browser and editor shortcuts using Ctrl, Cmd, or Alt are preserved, apart from the documented Ctrl+D/Ctrl+U scroll commands. Dialogs keep focus inside their controls until closed.

Selecting another item keeps the current detail tab. Filtering or removing the selected item selects the first visible item, or clears the selection if nothing matches. Failed detail loads and disconnected streams provide Retry controls; partial refresh failures identify the affected resource while retaining the last successful data.

The Patterns tab updates as the selected container produces logs. Pinned comparison panes update independently, so a quiet primary stream does not hide output from the pinned container or service. Log, stats, and Compose streams stop when the dashboard is hidden or their selection changes; streams that repeatedly end without output eventually stop retrying and offer an explicit Retry control.
