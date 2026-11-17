# AGENTS.md

Repository guidance for coding agents working on Sidekick Docker.

## Project

Sidekick Docker is a Docker management CLI/TUI plus a VS Code extension.

This repository contains three packages, but is not configured as an npm
workspace. Each package owns its dependencies and lockfile:

- `sidekick-docker-shared/` — Docker API layer, shared types, compose
  detection, the shared state store (`DockerStateStore`), the follow/reconnect
  stream policy (`FollowStream`), and formatters, including the UI policy both
  dashboards use. TypeScript emits CommonJS and declarations to `dist/`.
- `sidekick-docker-cli/` — Ink 7/React 19 terminal dashboard and CLI commands.
  esbuild emits the ESM executable `dist/sidekick-docker.mjs` (chmodded 0755,
  so the shebang works).
- `sidekick-docker-vscode/` — VS Code extension and browser webview. esbuild
  emits `out/extension.js` (CommonJS) and `out/webview/dashboard.js` (IIFE).

Build `sidekick-docker-shared` before either consumer; the CLI and extension
reference it through local `file:` dependencies.

`demo/` is not a package: it is a private folder that records the README and
docs GIFs and stills from a script, against an isolated Docker-in-Docker daemon
and an invented compose stack (see `demo/README.md`). Re-record there, after
the version bump, when a release changes what the dashboard or the extension
look like. Never delete or rename published files under `assets/`.

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

# Version all three packages and the root, including lockfiles
bash scripts/bump-version.sh 0.4.1
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

CI (`.github/workflows/ci.yml`) runs lint, the import check, and all three
`tsc --noEmit` passes in its `quality` job, alongside the three test suites and
the builds. `release.yml` repeats every gate in a `checks` job that both
publish jobs depend on. Still run the gate locally: esbuild does not
type-check, so `tsc --noEmit` is the only type gate for the CLI and extension.

## Stack

- TypeScript in strict mode
- Ink 7 and React 19 for the TUI
- esbuild for CLI and VS Code bundles; `tsc` for the shared package
- dockerode for the Docker Engine API
- Commander.js for CLI parsing
- Vitest for tests
- node-pty for embedded interactive exec; it is a native module excluded from
  the CLI bundle and only a devDependency, so npm installs fall back to
  `docker exec -it` with the dashboard suspended

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
- Keep domain state (refresh and Docker event policy) in the shared
  `sidekick-docker-shared/src/state/DockerStateStore.ts`. The CLI's
  `DockerState` and the extension's `DockerService`/`ContainerWatcherService`
  wrap it and add only surface-specific buffers. TUI view state belongs in the
  `Dashboard` reducer.
- Put action gating and wording that both dashboards show (`canStart`/
  `canStop`, prune/remove confirmations, `sortDirectionLabel`,
  `publishedPortUrls`, `actionText`) in `sidekick-docker-shared/src/formatters.ts`
  so the TUI and webview cannot drift apart.
- Treat `sidekick-docker-cli/src/dashboard/ink/keyRegistry.ts` as the source of
  truth for global TUI keybindings, help entries, and status-bar hints. The
  input router is `useKeyboardHandler.ts`; do not duplicate global bindings
  there.
- Require confirmation for destructive actions. Confirmation text must name
  its target when possible; Enter and Escape cancel in the TUI.
- Route CLI coloring through `sidekick-docker-cli/src/formatters.ts`, which
  handles `NO_COLOR`, `FORCE_COLOR`, TTY detection, and `--no-color`. Take TUI
  colours from the tokens in `sidekick-docker-cli/src/theme.ts` (`ACCENT`,
  `ACCENT_FILL`). ESLint rejects hex colour literals and raw ANSI escapes under
  `sidekick-docker-cli/src/dashboard/`. Ink's chrome is coloured by chalk,
  which ignores `NO_COLOR`; the CLI bundle banner maps `NO_COLOR` to
  `FORCE_COLOR=0`, so `NO_COLOR` and `--no-color` both make the whole TUI
  monochrome.
- Read VS Code settings through
  `sidekick-docker-vscode/src/settings.ts`. Route extension action feedback
  through `providers/actionRegistry.ts` and `runDockerAction`.
- Keep extension/webview messages typed in
  `sidekick-docker-vscode/src/types/messages.ts` and validate inbound webview
  messages with `messageSchemas.ts`. Its `WebviewMessageSchemaInSync` type
  assertion fails `tsc` when the schema and the `WebviewMessage` union drift.
- `sidekick-docker.socketPath` and `sidekick-docker.exec.defaultShell` are
  restricted configurations: workspace values are ignored until the folder is
  trusted. Keep any new setting that picks an endpoint or a command in that
  list.

## Key Entry Points

| Area | File |
| --- | --- |
| CLI entry | `sidekick-docker-cli/src/cli.ts` |
| CLI dashboard wiring | `sidekick-docker-cli/src/commands/dashboard.ts` |
| Main TUI component | `sidekick-docker-cli/src/dashboard/ink/Dashboard.tsx` |
| TUI keybinding registry | `sidekick-docker-cli/src/dashboard/ink/keyRegistry.ts` |
| Panel contract | `sidekick-docker-cli/src/dashboard/panels/types.ts` |
| CLI domain state | `sidekick-docker-cli/src/dashboard/DockerState.ts` |
| Shared state store | `sidekick-docker-shared/src/state/DockerStateStore.ts` |
| Stream reconnect policy | `sidekick-docker-shared/src/events/FollowStream.ts` |
| TUI colour tokens | `sidekick-docker-cli/src/theme.ts` |
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
- Docker events flow through `EventWatcher` into
  `DockerStateStore.processEvent()` (via the CLI's `DockerState` or the VS Code
  services), with a periodic full refresh as fallback. The store ignores no-op
  events such as healthcheck `exec_*`, debounces event-driven refreshes by
  500ms, replays events that arrive during a refresh, does one container
  listing per pass (`DockerClient.listResources()`), and abandons a pass after
  20s. See `specs/state/design.md`.
- Log and stats streams use the shared `FollowStream`: a stream of a stopped
  container ends instead of reconnecting, reconnects back off exponentially
  and resume logs from `LogResumeCursor`'s `since`, and a finished stream
  resumes when its target starts. The CLI's `BaseStreamManager` and the
  extension's `LogSlot` both build on it.
- Stats streaming is selection-driven. `StatsStreamManager` feeds a
  `StatsCollector` history of 60 samples.
- Log streaming is selection-driven and keeps at most `MAX_LOG_LINES` (1,000)
  entries.
- `docker compose` subprocesses run through `runProcess`
  (`compose/process.ts`) with deadlines; `DockerClient` reads time out after
  `requestTimeoutMs` (30s by default).
- Compose discovery merges labels from running containers with
  `docker compose config` data so planned and running services can appear
  together.
- Both bundles include `ssh2` with JavaScript fallbacks for its optional
  native accelerators (`scripts/native-fallbacks.cjs`). The CLI stubs
  `react-devtools-core`, externalizes `node-pty`, and injects `__CLI_VERSION__`.
- `npm run test:packages` builds and exercises SSH using the npm tarball and
  production VSIX in a temporary directory, with an ephemeral local SSH server.
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
| state | `sidekick-docker-shared/src/state/` | docker, compose, types |
| core/root barrel | `sidekick-docker-shared/src/` | all shared modules |

Consumers should import from the public package entry points:
`sidekick-docker-shared`, `sidekick-docker-shared/log`, and
`sidekick-docker-shared/formatters`.

Historical refactoring notes live in `specs/_archive/`. Current module design
documents live in `specs/*/design.md`; do not treat archived progress files as
active task lists.
