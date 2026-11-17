# Installation

## Prerequisites

- **Docker** running and accessible
- **The `docker` CLI** on your `PATH`. Most of Sidekick Docker talks to the Docker API directly, but Compose actions run `docker compose`, Exec in an npm install runs `docker exec -it`, and the VS Code Exec and Show Logs terminals run `docker`
- **Node.js** >= 22.12.0, for the terminal dashboard and CLI
- **VS Code** >= 1.109 (or a compatible editor), for the extension

!!! note "Docker contexts are not read"
    Sidekick Docker does not read `docker context`. It uses `--socket` (or the `sidekick-docker.socketPath` setting in VS Code), then `DOCKER_HOST`, then the default socket. If you run Colima, OrbStack, Podman or rootless Docker through a context, pass that context's endpoint with `--socket` or set `DOCKER_HOST`; `docker context inspect --format '{{.Endpoints.docker.Host}}'` prints it. See [Docker Socket](../configuration/docker-socket.md).

## Terminal (TUI / CLI)

Install the CLI globally from npm:

```bash
npm install -g sidekick-docker
```

Verify the installation:

```bash
sidekick-docker --version
```

## VS Code and Compatible Editors

The extension is published to [Open VSX](https://open-vsx.org/extension/CesarAndresLopez/sidekick-docker-vscode). The VS Code Marketplace listing is stuck at 0.4.1, so stock VS Code installs it from a `.vsix` file instead.

### VSCodium and other Open VSX editors

1. Open your editor
2. Go to Extensions (`Ctrl+Shift+X` / `Cmd+Shift+X`)
3. Search for **Sidekick Docker**
4. Click **Install**

Or install from the command line:

```bash
codium --install-extension CesarAndresLopez.sidekick-docker-vscode
```

### VS Code

1. Download `sidekick-docker-vscode-<version>.vsix` from the [latest GitHub Release](https://github.com/cesarandreslopez/sidekick-docker/releases/latest).
2. Install it from the command line:

    ```bash
    code --install-extension sidekick-docker-vscode-<version>.vsix
    ```

    Or open the Extensions view, click `…` at the top, and choose **Install from VSIX…**.

To update, install the newer `.vsix` the same way.

!!! warning
    `code --install-extension CesarAndresLopez.sidekick-docker-vscode`, like searching the Extensions view in stock VS Code, installs the stale 0.4.1 from the Marketplace.

## Build from Source

```bash
git clone https://github.com/cesarandreslopez/sidekick-docker.git
cd sidekick-docker
bash scripts/build-all.sh
```

This builds all three packages in order (shared, CLI, VS Code extension).

### Run the TUI after building

```bash
node ./sidekick-docker-cli/dist/sidekick-docker.mjs
```

A source checkout installs `node-pty` (a dev dependency), so Exec runs the shell embedded in the dashboard; if the native module cannot be loaded, Exec falls back to `docker exec -it` as in an npm install.

### Run the VS Code extension after building

Open the `sidekick-docker-vscode/` folder in VS Code and press `F5` and pick **VS Code Extension Development** in the debugger picker (no `launch.json` is committed) to launch the Extension Development Host.
