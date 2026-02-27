# Installation

## Prerequisites

- **Node.js** >= 20
- **Docker** running and accessible

## Terminal (TUI / CLI)

Install the CLI globally from npm:

```bash
npm install -g sidekick-docker
```

Verify the installation:

```bash
sidekick-docker --version
```

## VS Code / VSCodium / Compatible Editors

Install from [Open VSX](https://open-vsx.org/extension/CesarAndresLopez/sidekick-docker-vscode) (recommended for VSCodium and compatible editors) or the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=CesarAndresLopez.sidekick-docker-vscode):

1. Open your editor
2. Go to Extensions (`Ctrl+Shift+X` / `Cmd+Shift+X`)
3. Search for **Sidekick Docker**
4. Click **Install**

Or install from the command line:

```bash
# VS Code
code --install-extension CesarAndresLopez.sidekick-docker-vscode

# VSCodium
codium --install-extension CesarAndresLopez.sidekick-docker-vscode
```

## Build from Source

```bash
git clone https://github.com/cesarandreslopez/sidekick-docker.git
cd sidekick-docker
bash scripts/build-all.sh
```

This builds all three packages in order (shared, CLI, VS Code extension).

### Run the TUI after building

```bash
./sidekick-docker-cli/dist/sidekick-docker.mjs
```

### Run the VS Code extension after building

Open the `sidekick-docker-vscode/` folder in VS Code and press `F5` to launch the Extension Development Host.
