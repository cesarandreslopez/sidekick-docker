# Contributing to Sidekick Docker

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing.

## Getting Started

### Prerequisites

- Node.js 22.12+
- Docker running
- VS Code 1.109+ (for extension development)

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

- **TUI dashboard**: After building, run `node ./sidekick-docker-cli/dist/sidekick-docker.mjs` (esbuild writes the file mode 0644, so the `#!` line is inert and invoking the path directly exits 126)
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
npm test                         # runs shared + cli + vscode tests
npm run test:packages             # builds and checks SSH in the npm tarball and production VSIX
cd sidekick-docker-shared && npx vitest run   # shared only
cd sidekick-docker-cli && npx vitest run      # cli only
cd sidekick-docker-vscode && npx vitest run   # vscode only (vscode API mocked via src/test/vscode.ts)

# Linting (ESLint 10, flat config)
npm run lint                     # lint all packages
npm run lint:fix                 # lint + auto-fix
bash scripts/lint-all.sh         # alternative: also accepts extra args (e.g. --fix)

# Version management
bash scripts/bump-version.sh 0.4.1   # updates all 4 manifests and lockfiles, including local shared references
```

### Code Style

- TypeScript strict mode everywhere
- Tests use Vitest, co-located as `.test.ts` files alongside source
- ESLint 10 (flat config) enforces code quality — run `npm run lint` before submitting PRs

### Running Tests

Tests use Vitest and are co-located with source files (e.g., `FooService.ts` / `FooService.test.ts`). When adding new functionality, add tests alongside the source.

```bash
npm test             # Run all tests (shared + cli + vscode)
cd sidekick-docker-shared && npx vitest   # Watch mode
```

Before handing off code changes, run the complete gate from the repository root:

```bash
(cd sidekick-docker-shared && npx tsc --noEmit)
(cd sidekick-docker-cli && npx tsc --noEmit)
(cd sidekick-docker-vscode && npx tsc --noEmit)
npm run lint
npm test
node scripts/check-imports.mjs
npm run build
```

Install root lint dependencies with `npm ci` if needed. For changes to packaging or SSH, also run `npm run test:packages`. It packs the CLI and production VSIX into a temporary directory and connects both to an ephemeral local SSH fixture; it requires `tar`, `unzip`, npm, and network access to fetch `vsce`, but no real Docker daemon or SSH credentials. Documentation changes should pass `zensical build` after installing Zensical.

### Releases

Use `scripts/bump-version.sh` to synchronize manifests and lockfiles, then update the root, CLI, extension, and documentation changelogs. After validation, commit and push `main`, wait for CI and documentation deployment, and push an annotated `vX.Y.Z` tag on that commit. The Release workflow publishes the CLI to npm and the extension to Open VSX, then creates a GitHub release with the VSIX. The shared package remains internal. Monitor each job and verify the registry listings and release asset before reporting completion.

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

- **Panel system**: Each resource type (containers, compose, images, volumes, networks) implements the `SidePanel` interface with `getItems()`, `detailTabs[]`, and `getActions()`; global TUI keybindings live in the `ink/keyRegistry.ts` registry, not on panels
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
3. Ensure linting and tests pass (`npm run lint && npm test`)
4. Update documentation if needed
5. Submit a PR with a clear description

## Areas for Contribution

### Good First Issues

Look for issues labeled `good first issue` -- these are suitable for newcomers.

### Current Priorities

- Test coverage improvements
- New container actions (attach, inspect)
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
