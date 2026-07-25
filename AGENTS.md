# AGENTS.md

Repository guidance for coding agents working on Sidekick Docker.

## Project

Sidekick Docker is a Docker management CLI/TUI plus a VS Code extension.

This repository contains three packages, but is not configured as an npm
workspace. Each package owns its dependencies and lockfile:

- `sidekick-docker-shared/` — Docker API layer, shared types, compose
  detection, streaming utilities, and formatters. TypeScript emits CommonJS
  and declarations to `dist/`.
- `sidekick-docker-cli/` — Ink 7/React 19 terminal dashboard and CLI commands.
  esbuild emits the ESM executable `dist/sidekick-docker.mjs`.
- `sidekick-docker-vscode/` — VS Code extension and browser webview. esbuild
  emits `out/extension.js` (CommonJS) and `out/webview/dashboard.js` (IIFE).

Build `sidekick-docker-shared` before either consumer; the CLI and extension
reference it through local `file:` dependencies.

## Commands

Run commands from the repository root unless a subshell is shown.

```bash
# Full build, ordered shared -> CLI -> VS Code
npm run build

# Alternative bootstrap + build; runs npm install in each package
bash scripts/build-all.sh

# Individual builds
npm run build:shared
npm run build:cli
npm run build:vscode

# All tests, including VS Code
npm test

# Individual test suites
(cd sidekick-docker-shared && npm test)
(cd sidekick-docker-cli && npm test)
(cd sidekick-docker-vscode && npm test)

# Static checks
(cd sidekick-docker-shared && npx tsc --noEmit)
(cd sidekick-docker-cli && npx tsc --noEmit)
(cd sidekick-docker-vscode && npx tsc --noEmit)
npm run lint
node scripts/check-imports.mjs

# Version all three packages and the root manifest
bash scripts/bump-version.sh 0.4.0
```

Before committing code changes, run:

```bash
(cd sidekick-docker-shared && npx tsc --noEmit)
(cd sidekick-docker-cli && npx tsc --noEmit)
(cd sidekick-docker-vscode && npx tsc --noEmit)
npm run lint
npm test
node scripts/check-imports.mjs
npm run build
```

Use the smallest relevant test command while iterating, then run the complete
gate above before handoff. Tests are colocated as `.test.ts`/`.test.tsx`.

## Stack

- TypeScript in strict mode
- Ink 7 and React 19 for the TUI
- esbuild for CLI and VS Code bundles; `tsc` for the shared package
- dockerode for the Docker Engine API
- Commander.js for CLI parsing
- Vitest for tests
- node-pty for interactive exec; it is a native module excluded from the CLI
  bundle

The supported runtime baseline is Node.js 22.12 or newer. Extension development
targets VS Code 1.109 or newer.

## Conventions

- Put shared public types in `sidekick-docker-shared/src/types/`.
- Keep direct dockerode usage inside
  `sidekick-docker-shared/src/docker/DockerClient.ts`; CLI and VS Code code
  should use the `DockerClient` facade.
- Use `AsyncIterable`/async generators for logs, stats, and Docker events.
- Use the `docker compose` CLI for compose operations rather than the Docker
  Engine API.
- Keep domain state in `DockerState`. TUI view state belongs in the
  `Dashboard` reducer.
- Treat `sidekick-docker-cli/src/dashboard/ink/keyRegistry.ts` as the source of
  truth for global TUI keybindings, help entries, and status-bar hints. The
  input router is `useKeyboardHandler.ts`; do not duplicate global bindings
  there.
- Require confirmation for destructive actions. Confirmation text must name
  its target when possible; Enter and Escape cancel in the TUI.
- Route CLI coloring through `sidekick-docker-cli/src/formatters.ts`, which
  handles `NO_COLOR`, `FORCE_COLOR`, TTY detection, and `--no-color`. Do not
  add raw ANSI styling in feature code.
- Read VS Code settings through
  `sidekick-docker-vscode/src/settings.ts`. Route extension action feedback
  through `providers/actionRegistry.ts` and `runDockerAction`.
- Keep extension/webview messages typed in
  `sidekick-docker-vscode/src/types/messages.ts` and validate inbound webview
  messages with `messageSchemas.ts`.

## Key Entry Points

| Area | File |
| --- | --- |
| CLI entry | `sidekick-docker-cli/src/cli.ts` |
| CLI dashboard wiring | `sidekick-docker-cli/src/commands/dashboard.ts` |
| Main TUI component | `sidekick-docker-cli/src/dashboard/ink/Dashboard.tsx` |
| TUI keybinding registry | `sidekick-docker-cli/src/dashboard/ink/keyRegistry.ts` |
| Panel contract | `sidekick-docker-cli/src/dashboard/panels/types.ts` |
| CLI domain state | `sidekick-docker-cli/src/dashboard/DockerState.ts` |
| Docker facade | `sidekick-docker-shared/src/docker/DockerClient.ts` |
| Shared public exports | `sidekick-docker-shared/src/index.ts` |
| VS Code activation | `sidekick-docker-vscode/src/extension.ts` |
| Webview provider | `sidekick-docker-vscode/src/providers/DockerDashboardProvider.ts` |
| Webview HTML/CSS | `sidekick-docker-vscode/src/providers/dashboardHtml.ts` |
| Webview entry | `sidekick-docker-vscode/src/webview/dashboard.ts` |
| VS Code settings | `sidekick-docker-vscode/src/settings.ts` |

## Architecture Patterns

- Panels implement `SidePanel`, exposing items, detail tabs, and per-item
  actions. Panel-contextual global actions such as filter, sort, and compare
  still belong in `keyRegistry.ts`.
- Docker events flow through `EventWatcher` to
  `DockerState.processEvent()`/the VS Code service, with a periodic full
  refresh as fallback.
- Stats streaming is selection-driven. `StatsStreamManager` feeds a
  `StatsCollector` history of 60 samples.
- Log streaming is selection-driven and keeps at most `MAX_LOG_LINES` (1,000)
  entries.
- Compose discovery merges labels from running containers with
  `docker compose config` data so planned and running services can appear
  together.
- The CLI esbuild configuration stubs `ssh2`, `cpu-features`, and
  `react-devtools-core`, externalizes `node-pty`, and injects
  `__CLI_VERSION__`.
- The extension host and webview communicate with typed `postMessage()`
  payloads.

## Module Boundaries

`scripts/check-imports.mjs` is the executable source of truth for the import
dependency graph.

| Shared module | Path | Allowed internal dependencies |
| --- | --- | --- |
| types | `sidekick-docker-shared/src/types/` | none |
| docker | `sidekick-docker-shared/src/docker/` | types |
| compose | `sidekick-docker-shared/src/compose/` | types |
| log | `sidekick-docker-shared/src/log/` | none |
| events | `sidekick-docker-shared/src/events/` | docker, types |
| stats | `sidekick-docker-shared/src/stats/` | types |
| core/root barrel | `sidekick-docker-shared/src/` | all shared modules |

Consumers should import from the public package entry points:
`sidekick-docker-shared`, `sidekick-docker-shared/log`, and
`sidekick-docker-shared/formatters`.

Historical refactoring notes live in `specs/_archive/`. Current module design
documents live in `specs/*/design.md`; do not treat archived progress files as
active task lists.
