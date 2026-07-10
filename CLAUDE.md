# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# sidekick-docker

Docker management TUI/CLI + VSCode extension.

## Architecture

Monorepo with 3 packages (NOT npm workspaces — each package manages its own deps):

- `sidekick-docker-shared/` — Docker API layer, types, compose detection. Built with `tsc` to `dist/` (CommonJS + declarations).
- `sidekick-docker-cli/` — TUI dashboard (Ink 6 + React 19). Bundled with esbuild to single ESM binary `dist/sidekick-docker.mjs`.
- `sidekick-docker-vscode/` — VSCode extension. esbuild produces dual output: `out/extension.js` (CJS, Node) + `out/webview/dashboard.js` (IIFE, browser).

Shared must be built first — CLI and VSCode depend on it via local file path.

## Build & Test

```bash
# Full build (shared → cli → vscode)
npm run build
bash scripts/build-all.sh       # alternative: also runs npm install per package

# Individual packages
npm run build:shared             # tsc in sidekick-docker-shared
npm run build:cli                # esbuild in sidekick-docker-cli
npm run build:vscode             # esbuild in sidekick-docker-vscode

# Tests (vitest, co-located .test.ts files)
npm test                         # runs shared + cli + vscode tests
cd sidekick-docker-shared && npx vitest run              # shared only
cd sidekick-docker-cli && npx vitest run                 # cli only
cd sidekick-docker-vscode && npx vitest run              # vscode only (vscode API mocked via src/test/vscode.ts)
cd sidekick-docker-shared && npx vitest run src/docker   # single directory
cd sidekick-docker-shared && npx vitest run DockerClient  # single file by name

# Version management
bash scripts/bump-version.sh 0.2.0   # bumps all 4 package.json files (root + 3 packages)
```

## Stack

- **TypeScript** (strict mode everywhere)
- **Ink 6 + React 19** for TUI
- **esbuild** for CLI/VSCode bundling, **tsc** for shared
- **dockerode** for Docker API
- **Commander.js** for CLI argument parsing
- **vitest** for testing
- **node-pty** for interactive exec (native module, excluded from bundle)

## Conventions

- All shared types live in `sidekick-docker-shared/src/types/`
- Docker API interactions go through `DockerClient` facade (never use dockerode directly in CLI/VSCode)
- Streams (logs, stats, events) use `AsyncIterable` with async generators
- Compose operations use `docker compose` CLI (not Docker API)
- UI state uses `useReducer` in Dashboard component; domain state in `DockerState` class
- VI keybindings: j/k navigation, g/G top/bottom, h/l focus, 1-5 panel switch, [/] detail tabs,
  PgUp/PgDn + Ctrl+D/U paging. TUI global bindings live in `ink/keyRegistry.ts` — the single
  source of truth driving dispatch, the help overlay, and status-bar hints; add new global keys
  there, not in `useKeyboardHandler`
- Confirmation modal required for all destructive actions (remove, prune); confirm messages
  name their target (`confirmMessage` accepts a function of the item); Enter cancels (safe default)
- CLI colors are gated centrally in `sidekick-docker-cli/src/formatters.ts`
  (NO_COLOR/FORCE_COLOR/isTTY + `--no-color`); never emit raw ANSI directly
- VSCode settings are read only through `sidekick-docker-vscode/src/settings.ts`;
  action feedback goes through `providers/actionRegistry.ts` (`runDockerAction`)
- Tests are co-located as `.test.ts` files

## Key Entry Points

| What | File |
|------|------|
| CLI entry | `sidekick-docker-cli/src/cli.ts` (Commander.js setup) |
| Dashboard action | `sidekick-docker-cli/src/commands/dashboard.ts` (wires everything) |
| Main TUI component | `sidekick-docker-cli/src/dashboard/ink/Dashboard.tsx` |
| Panel interface | `sidekick-docker-cli/src/dashboard/panels/types.ts` (`SidePanel`) |
| Domain state | `sidekick-docker-cli/src/dashboard/DockerState.ts` |
| Docker facade | `sidekick-docker-shared/src/docker/DockerClient.ts` |
| Shared exports | `sidekick-docker-shared/src/index.ts` |
| TUI keybinding registry | `sidekick-docker-cli/src/dashboard/ink/keyRegistry.ts` |
| VSCode activation | `sidekick-docker-vscode/src/extension.ts` |
| Webview provider | `sidekick-docker-vscode/src/providers/DockerDashboardProvider.ts` |
| Webview HTML/CSS template | `sidekick-docker-vscode/src/providers/dashboardHtml.ts` |
| VSCode settings reader | `sidekick-docker-vscode/src/settings.ts` |

## Key Patterns

- **Panel system**: Implement `SidePanel` interface for each resource type. Panels define `getItems()`, `detailTabs[]` with render functions, and `getActions()` (per-item shortcuts, confirm metadata, handlers that may return a success-toast string). Panel-contextual *global* keys (filter, sort, compare) belong in `ink/keyRegistry.ts`.
- **State flow**: Docker events → `EventWatcher` → `DockerState.processEvent()` → `scheduleRender()`. Fallback: 30s periodic full refresh.
- **Stats streaming**: Selection-driven (expensive). `StatsStreamManager.select(id)` starts stream → pushes to `StatsCollector` ring buffer (60 samples) → sparklines.
- **Log streaming**: Selection-driven. `LogStreamManager.select(id)` starts stream → ring buffer (1000 lines).
- **Compose detection**: Primary from container labels (`com.docker.compose.*`), secondary from `docker compose config`. Merged to show running + planned services.
- **esbuild plugins** (CLI): Stubs `ssh2`, `cpu-features`, `react-devtools-core`. Externalizes `node-pty`. Injects `__CLI_VERSION__`.
- **VSCode webview protocol**: Extension ↔ webview communicate via `postMessage()` with typed messages defined in `sidekick-docker-vscode/src/types/messages.ts`.

## Module Architecture

The shared package is organized into 7 sub-modules, each with a barrel `index.ts` defining its public API. Import DAG is enforced by `scripts/check-imports.mjs`.

### Shared Sub-Modules

| Module | Path | Deps | Sub-path Export |
|--------|------|------|-----------------|
| types | `shared/src/types/` | (leaf) | — |
| docker | `shared/src/docker/` | types | — |
| compose | `shared/src/compose/` | types | — |
| log | `shared/src/log/` | (leaf) | `sidekick-docker-shared/log` |
| events | `shared/src/events/` | docker, types | — |
| stats | `shared/src/stats/` | types | — |
| core | `shared/src/` (root) | types | `sidekick-docker-shared/formatters` |

### Dependency DAG

```
                    ┌─────────┐
                    │  types  │  (Layer 0 — leaf)
                    └────┬────┘
          ┌──────────┬───┴───┬──────────┬──────────┐
          ▼          ▼       ▼          ▼          ▼
     ┌────────┐ ┌────────┐ ┌─────┐ ┌────────────┐ │
     │ docker │ │compose │ │stats│ │ formatters │ │
     └───┬────┘ └────────┘ └─────┘ └────────────┘ │
         ▼                                         │
     ┌────────┐                                    │
     │ events │                                    │
     └────────┘                                    │
                                                   │
     ┌─────┐  (leaf — no internal deps)            │
     │ log │                                       │
     └─────┘                                       │
     ┌──────────────────┐  (leaf)                  │
     │ branding/phrases │                          │
     └──────────────────┘                          │
                    ┌──────────────┐               │
                    │ shared/index │◄──────────────┘
                    └──────┬───────┘
                ┌──────────┴──────────┐
                ▼                     ▼
          ┌──────────┐         ┌──────────┐
          │   cli    │         │  vscode  │
          └──────────┘         └──────────┘
```

### Quality Gates

Run these checks before every commit:

```bash
npx tsc --noEmit                                        # per-package type check
npm test                                                # vitest (shared + cli)
node scripts/check-imports.mjs                          # import DAG enforcement
npx madge --circular --extensions ts,tsx src/            # no circular deps
```

### Known Technical Debt

- `webview/dashboard.ts` is still large (~1080 LOC of renderers; keyboard/overlays/HTML
  extracted to their own modules); `Dashboard.tsx` ~690 LOC
- `noUncheckedIndexedAccess` not yet enabled (50+ errors to fix)
- See `specs/_archive/` for refactoring history and `specs/*/design.md` for module design docs
