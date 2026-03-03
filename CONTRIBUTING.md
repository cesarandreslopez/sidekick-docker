# Contributing to Sidekick Docker

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing.

## Getting Started

### Prerequisites

- Node.js 20+
- Docker running
- VS Code 1.85+ (for extension development)

### Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/cesarandreslopez/sidekick-docker.git
   cd sidekick-docker
   ```

2. **Build all packages**
   ```bash
   bash scripts/build-all.sh
   ```

3. **Run tests to verify setup**
   ```bash
   npm test
   ```

## Development Workflow

### Running Locally

- **TUI dashboard**: After building, run `./sidekick-docker-cli/dist/sidekick-docker.mjs`
- **VS Code extension**: Open `sidekick-docker-vscode/` in VS Code and press `F5` to launch the Extension Development Host

### Available Commands

```bash
# Full build (shared -> cli -> vscode)
npm run build
bash scripts/build-all.sh       # alternative: also runs npm install per package

# Individual packages
npm run build:shared             # tsc in sidekick-docker-shared
npm run build:cli                # esbuild in sidekick-docker-cli
npm run build:vscode             # esbuild in sidekick-docker-vscode

# Tests (vitest, co-located .test.ts files)
npm test                         # runs shared + cli tests
cd sidekick-docker-shared && npx vitest run   # shared only
cd sidekick-docker-cli && npx vitest run      # cli only

# Version management
bash scripts/bump-version.sh 0.2.0   # bumps all 4 package.json files (root + 3 packages)
```

### Code Style

- TypeScript strict mode everywhere
- Tests use Vitest, co-located as `.test.ts` files alongside source
- No ESLint configured yet — contributions to add linting are welcome

### Running Tests

Tests use Vitest and are co-located with source files (e.g., `FooService.ts` / `FooService.test.ts`). When adding new functionality, add tests alongside the source.

```bash
npm test             # Run all tests (shared + cli)
cd sidekick-docker-shared && npx vitest   # Watch mode
```

## Project Structure

```
sidekick-docker/
├── sidekick-docker-shared/   # Docker API layer, types, compose detection (tsc -> dist/)
├── sidekick-docker-cli/      # TUI dashboard + CLI commands (esbuild -> dist/)
├── sidekick-docker-vscode/   # VS Code extension (esbuild -> out/)
├── scripts/                  # Build and version scripts
├── docs/                     # Documentation site
└── ...
```

### Key Architecture Concepts

- **Panel system**: Each resource type (containers, compose, images, volumes, networks) implements the `SidePanel` interface with `getItems()`, `detailTabs[]`, `getActions()`, and optional `getKeybindings()`
- **State flow**: Docker events -> `EventWatcher` -> `DockerState.processEvent()` -> `scheduleRender()`. Fallback: 30s periodic full refresh
- **Stats streaming**: Selection-driven (expensive). `StatsStreamManager.select(id)` starts stream -> pushes to `StatsCollector` ring buffer (60 samples) -> sparklines
- **Log streaming**: Selection-driven. `LogStreamManager.select(id)` starts stream -> ring buffer (1000 lines)
- **Compose detection**: Primary from container labels (`com.docker.compose.*`), secondary from `docker compose config`. Merged to show running + planned services
- **Build system**: tsc for shared (CommonJS + declarations), esbuild for CLI (single ESM binary) and VS Code (dual CJS + IIFE output)
- **VS Code webview protocol**: Extension and webview communicate via `postMessage()` with typed messages

## Making Changes

### Branch Naming

- `feature/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation changes
- `refactor/description` - Code refactoring

### Commit Messages

This project uses [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(containers): add bulk stop action
fix(stats): handle missing CPU delta gracefully
docs: update README with troubleshooting section
refactor(compose): extract detection logic into separate module
```

Guidelines:
- Use present tense, imperative mood ("add feature" not "added feature")
- Keep the first line under 72 characters
- Reference issues when applicable (`Fix #123`)

### Pull Requests

1. Create a feature branch from `main`
2. Make your changes with clear commits
3. Ensure all tests pass (`npm test`)
4. Update documentation if needed
5. Submit a PR with a clear description

## Areas for Contribution

### Good First Issues

Look for issues labeled `good first issue` -- these are suitable for newcomers.

### Current Priorities

- Test coverage improvements
- New container actions (pause, unpause, attach)
- Remote Docker host support
- Documentation and developer experience
- Bug fixes

### Components

| Component | Path | Description |
|-----------|------|-------------|
| CLI / TUI | `sidekick-docker-cli/` | Terminal dashboard (Ink + React) |
| VS Code Extension | `sidekick-docker-vscode/` | Webview-based dashboard |
| Shared Library | `sidekick-docker-shared/` | Docker API facade, types, compose detection |

## Questions?

- Open an issue for bugs or feature requests
- Check existing issues before creating new ones

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
