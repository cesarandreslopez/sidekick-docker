# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# sidekick-docker

Docker management TUI/CLI + VSCode extension.

## Architecture

Monorepo with 3 packages (NOT npm workspaces — each package manages its own deps):

- `sidekick-docker-shared/` — Docker API layer, types, compose detection. Built with `tsc` to `dist/` (CommonJS + declarations).
- `sidekick-docker-cli/` — TUI dashboard (Ink 7 + React 19). Bundled with esbuild to single ESM binary `dist/sidekick-docker.mjs`.
- `sidekick-docker-vscode/` — VSCode extension. esbuild produces dual output: `out/extension.js` (CJS, Node) + `out/webview/dashboard.js` (IIFE, browser).

Shared must be built first — CLI and VSCode depend on it via local file path (`file:../sidekick-docker-shared`).

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
cd <package> && npm run test:watch                       # watch mode (all 3 packages)

# Lint (ESLint 10 flat config — root eslint.config.mjs)
npm run lint
npm run lint:fix
bash scripts/lint-all.sh --fix   # alternative: accepts pass-through args

# Dev loop
cd sidekick-docker-vscode && npm run watch            # esbuild watch mode
node ./sidekick-docker-cli/dist/sidekick-docker.mjs   # run the built TUI
npm run clean                                         # rm -rf dist/ + out/ across packages

# Version management
bash scripts/bump-version.sh 0.2.0   # bumps all 4 package.json files (root + 3 packages)
```

Two things that bite:

- **The built CLI is not executable.** esbuild writes `dist/sidekick-docker.mjs` with mode 0644 and
  never chmods it, so the `#!/usr/bin/env node` banner is inert — invoking the path directly exits 126.
  Run it as `node dist/sidekick-docker.mjs`, which is what CI does.
- **No `launch.json` is committed**, so F5 does not "just work". Open `sidekick-docker-vscode/` as the
  workspace root (the monorepo root has no extension manifest) and pick "VS Code Extension Development"
  from the debugger picker on first run.

`sidekick-docker-vscode` is the only package with a `vitest.config.ts` — it aliases `vscode` →
`src/test/vscode.ts`. shared and cli run on vitest defaults (no config file, no setup files).

## Quality Gates

Run these before every commit. All four are currently green — if one fails, you broke it.

```bash
npm run lint                                     # ESLint 10 (typescript-eslint strict + react-hooks on cli)
npm test                                         # vitest: shared + cli + vscode
node scripts/check-imports.mjs                   # import DAG enforcement
cd sidekick-docker-shared && npx tsc --noEmit     # no root tsconfig — run per package
cd sidekick-docker-cli    && npx tsc --noEmit
cd sidekick-docker-vscode && npx tsc --noEmit
```

**The `tsc --noEmit` runs are not optional for cli and vscode.** Those builds are esbuild, which strips
types without checking them, so `tsc --noEmit` is the *only* type gate for those two packages — and CI
never runs it. `sidekick-docker-shared` is the exception: its `build` script *is* `tsc`, so type errors
there fail the build, and CI does run that build (in both the `cli-tests` and `build-extension` jobs).
There is no root `tsconfig.json`, so running `tsc` from the repo root checks nothing.

## CI & Release

- **`ci.yml`** — push/PR to `main`, **path-filtered to `sidekick-docker-*/**`**. Node 22. Runs tests and
  builds only: **no lint, no `check-imports.mjs`, no `tsc --noEmit`**, and the `build-extension` job
  packages the `.vsix` but never runs the vscode tests. Edits confined to root `package.json`,
  `eslint.config.mjs`, `scripts/`, or the workflows themselves trigger **no CI at all** — verify those locally.
- **`release.yml`** — on tag `v*`. Asserts the tag commit is an ancestor of `origin/main` and that all
  three package versions equal the tag, then publishes to **Open VSX only (no VS Code Marketplace)**,
  `npm publish`es `sidekick-docker`, and creates a GitHub Release from the matching CHANGELOG section.
- **`docs.yml`** — `docs/**` or `mkdocs.yml` → `pip install zensical && zensical build` → GitHub Pages.
  No npm script and no pinned Python requirements file; to build docs locally, install zensical yourself.
- **Release flow**: `bash scripts/bump-version.sh X.Y.Z` (rewrites 4 package.json files; **does not commit
  or tag**) → update CHANGELOG.md → commit → `git tag vX.Y.Z` → push tags.
- **`bump-version.sh` does not touch the lockfiles.** `npm ci` tolerates the resulting root-version skew,
  so nothing fails — but the three `package-lock.json` files keep the *previous* version in `.version` and
  `.packages[""].version` (plus `.packages["../sidekick-docker-shared"].version` in cli and vscode) unless
  you update them by hand. Do not `sed` the lockfiles: `@alcalzone/ansi-tokenize` is genuinely `0.3.0`, so
  a blind version replace corrupts a real dependency pin.
- **Node**: CI and release both pin 22. Only the CLI declares `engines.node` (`>=22.12.0`, raised from
  `>=20` in 0.4.0 for Ink 7 / Commander 15). There is no `.nvmrc` or `.npmrc`.

## Stack

- **TypeScript** (strict mode everywhere)
- **Ink 7 + React 19** for TUI
- **esbuild** for CLI/VSCode bundling, **tsc** for shared
- **dockerode** for Docker API, **zod** for validating daemon responses and webview messages
- **Commander.js** for CLI argument parsing
- **vitest** for testing
- **node-pty** for interactive exec (native module, excluded from bundle)

## Conventions

- Shared *resource/domain* types (container, image, volume, network, compose, events) live in
  `sidekick-docker-shared/src/types/`. Per-module option/result types stay beside their implementation
  (`DockerClientOptions` in `docker/DockerClient.ts`, `SeverityLevel` in `log/LogAnalytics.ts`) and are
  re-exported through the module barrel and `src/index.ts`
- Docker API interactions go through `DockerClient` facade (never use dockerode directly in CLI/VSCode)
- Streams (logs, stats, events) use `AsyncIterable` with async generators
- Compose operations use `docker compose` CLI (not Docker API)
- UI state uses `useReducer` in Dashboard component; domain state in `DockerState` class
- VI keybindings: j/k navigation, g/G top/bottom, h/l focus, 1-5 panel switch, [/] detail tabs,
  PgUp/PgDn + Ctrl+D/U paging. TUI global bindings live in `ink/keyRegistry.ts` — the single
  source of truth driving dispatch, the help overlay, and status-bar hints; add new global keys
  there, not in `useKeyboardHandler`
- **`keyRegistry` matching is first-hit.** `useKeyboardHandler` runs the first binding whose `match()`
  returns true, so order matters only between bindings whose predicates overlap — today none do
  (`keyRegistry.test.ts` asserts every key resolves to exactly one binding). When adding a global key,
  check that no earlier binding already matches it, and note that a global whose `isAvailable` is false
  swallows the key with a "Not available here" toast rather than falling through to a panel action
- Confirmation modal required for all destructive actions (remove, prune); confirm messages
  name their target (`confirmMessage` accepts a function of the item); Enter cancels (safe default)
- **Panel action handlers returning a string set the success-toast text** (e.g. "Pruned — 1.2 GB
  reclaimed"); returning nothing falls back to the action label. `confirm: true` stores the wrapped
  closure in reducer state instead of executing it — clearing that closure is what closes the modal
- **Overlay geometry is shared with mouse hit-testing.** `ink/overlayHitTest.ts` exports both the origins
  the overlay components render at *and* the hit functions `useMouseHandler` uses. Change an overlay's
  JSX rows and you must update the matching hit function, or clicks silently miss
- CLI colors are gated centrally in `sidekick-docker-cli/src/formatters.ts`
  (NO_COLOR/FORCE_COLOR/isTTY + `--no-color`); never emit raw ANSI directly.
  **Note `--no-color` only reaches `formatters.ts`** — Ink's own `<Text color>` props are hardcoded, so
  the TUI chrome stays colored; Ink/chalk honor only the `NO_COLOR`/`FORCE_COLOR` env vars
- **There is no `exec` method on `DockerClient`** — exec is implemented per consumer. CLI uses node-pty
  via `dashboard/ExecManager.ts` (dynamic `import('node-pty')`; returns `false` when the native module is
  missing, falling back to unmounting Ink and `spawnSync`-ing `docker exec -it`). VSCode creates a
  `vscode.Terminal` with `shellPath: 'docker'`
- **Endpoint resolution lives in `shared/src/docker/endpoint.ts`** — `parseDockerEndpoint`,
  `describeDockerEndpoint`, and `dockerCliEnv` (which exists because spawned `docker compose` subprocesses
  don't inherit dockerode's endpoint). There is **no `docker context` detection** anywhere in the repo
- **Zod guards both trust boundaries**: `shared/src/docker/schemas.ts` validates raw daemon responses;
  `vscode/src/types/messageSchemas.ts` (`WebviewMessageSchema`) `safeParse`s every inbound webview message.
  That schema is **hand-synced** with the `WebviewMessage` union — update both together
- VSCode settings are read only through `sidekick-docker-vscode/src/settings.ts`;
  action feedback goes through `providers/actionRegistry.ts` (`runDockerAction`)
- **VSCode has two independent surfaces** — the TreeView (`ContainerWatcherService`, its own `DockerClient`)
  and the webview dashboard (`DockerDashboardProvider`, its own `DockerService`). They poll separately
- **Webview CSP is `default-src 'none'` with a nonce-only `script-src`.** HTML is built by string
  templating, so every interpolation must go through `escapeHtml`/`escapeAttr` in `webview/formatters.ts`
- Tests are co-located as `.test.ts` files

## Key Entry Points

| What | File |
|------|------|
| CLI entry | `sidekick-docker-cli/src/cli.ts` (Commander.js setup) |
| Dashboard action | `sidekick-docker-cli/src/commands/dashboard.ts` (wires everything) |
| Main TUI component | `sidekick-docker-cli/src/dashboard/ink/Dashboard.tsx` |
| Panel interface | `sidekick-docker-cli/src/dashboard/panels/types.ts` (`SidePanel`) |
| Domain state | `sidekick-docker-cli/src/dashboard/DockerState.ts` |
| Stream manager base | `sidekick-docker-cli/src/dashboard/BaseStreamManager.ts` |
| Docker facade | `sidekick-docker-shared/src/docker/DockerClient.ts` |
| Endpoint / DOCKER_HOST parsing | `sidekick-docker-shared/src/docker/endpoint.ts` |
| Shared exports | `sidekick-docker-shared/src/index.ts` |
| TUI keybinding registry | `sidekick-docker-cli/src/dashboard/ink/keyRegistry.ts` |
| VSCode activation | `sidekick-docker-vscode/src/extension.ts` |
| VSCode Docker state owner | `sidekick-docker-vscode/src/services/DockerService.ts` |
| Webview provider | `sidekick-docker-vscode/src/providers/DockerDashboardProvider.ts` |
| Webview HTML/CSS template | `sidekick-docker-vscode/src/providers/dashboardHtml.ts` |
| Webview panel interface | `sidekick-docker-vscode/src/webview/panels/types.ts` (`PanelDefinition`) |
| Webview message protocol | `sidekick-docker-vscode/src/types/messages.ts` + `messageSchemas.ts` |
| VSCode settings reader | `sidekick-docker-vscode/src/settings.ts` |
| Lint config | `eslint.config.mjs` (root, covers all 3 packages) |

## Key Patterns

- **Panel system**: Implement `SidePanel` interface for each resource type. Panels define `getItems()`, `detailTabs[]` with render functions, and `getActions()` (per-item shortcuts, confirm metadata, handlers that may return a success-toast string). Panel-contextual *global* keys (filter, sort, compare) belong in `ink/keyRegistry.ts`. The VSCode webview mirrors this with its own `PanelDefinition` in `webview/panels/types.ts` — the two are parallel, not shared.
- **State flow**: Docker events → `EventWatcher` → `DockerState.processEvent()` → `scheduleRender()`. `processEvent` optimistically patches local state (start/unpause → `running`, stop/die → `exited`, pause → `paused`, destroy → dropped via `filter` reassignment plus cache eviction), then schedules a debounced (500ms) refresh for `create`, non-container resource events, and named misc events (rename/update/health_status) — and *also* after start/unpause, to re-sync accurate status. Fallback: 30s periodic full refresh.
- **Stream managers**: Three classes (`LogStreamManager`, `ComposeLogStreamManager`, `StatsStreamManager`) extend `BaseStreamManager`, which owns the select/abort/generation/reconnect lifecycle. Subclasses implement eight abstract members — `streamLabel`, `emptyId`, `isSameId`, `isValidId`, `idLabel`, `createStream`, `processItem`, `onClear` — plus optional `onBeforeStream`/`onStop` hooks. `commands/dashboard.ts` instantiates five managers from those three classes: primary + secondary (compare-mode) container logs, primary + secondary compose logs, and stats.
- **Stats streaming**: Selection-driven (expensive). `StatsStreamManager.select(id)` starts stream → pushes to `StatsCollector` ring buffer (60 samples) → sparklines. Only streams when the Stats tab is active or the sort field needs live data.
- **Log streaming**: Selection-driven. `LogStreamManager.select(id)` starts stream → ring buffer (1000 lines).
- **Render throttling**: `scheduleRender()` batches at 200ms and **drops the frame** when `process.stdout.writableLength > writableHighWaterMark` (backpressure guard); stream callbacks add a further 100ms flush debounce. `SIDEKICK_DEBUG_STREAMS=1` dumps heap/stdout diagnostics every 60s.
- **Compose detection**: Primary from container labels (`com.docker.compose.*`), secondary from `docker compose config`. Merged to show running + planned services.
- **esbuild plugins** (CLI): Stubs `ssh2`, `cpu-features`, `react-devtools-core`. Externalizes `node-pty`. Injects `__CLI_VERSION__`.
- **VSCode webview protocol**: Extension ↔ webview communicate via `postMessage()` with typed messages defined in `sidekick-docker-vscode/src/types/messages.ts` (11 extension→webview, 12 webview→extension variants).

## Module Architecture

The shared package is organized into sub-modules, each with a barrel `index.ts` defining its public API.
The import DAG is enforced across **all three packages** by `scripts/check-imports.mjs`.

### Shared Sub-Modules

| Module | Path | Deps | Sub-path Export |
|--------|------|------|-----------------|
| types | `shared/src/types/` | (leaf) | — |
| docker | `shared/src/docker/` | types | — |
| compose | `shared/src/compose/` | types | — |
| log | `shared/src/log/` | (leaf) | `sidekick-docker-shared/log` |
| events | `shared/src/events/` | docker, types | — |
| stats | `shared/src/stats/` | types | — |
| core | `shared/src/` (root) | **all six sub-modules** | `sidekick-docker-shared/formatters` |
| integration | `shared/src/integration/` | (test-only, no barrel) | — |

`core` is the root-level files (`index.ts`, `formatters.ts`, `errors.ts`, `branding.ts`, `phrases.ts`) and
may import everything — `formatters.ts` genuinely depends on `docker/utils`. `integration/` holds
`module-boundaries.test.ts`, which asserts barrel-export completeness and sub-path reference identity;
`check-imports.mjs` classifies it as `shared/core` by fall-through.

### Enforced Dependency DAG

Transcribed from `ALLOWED_DEPS` in `scripts/check-imports.mjs` — keep these in sync:

```
shared/types  → ()                          [leaf]
shared/log    → ()                          [leaf]
shared/docker, shared/compose, shared/stats → shared/types
shared/events → shared/docker, shared/types
shared/core   → all six sub-modules

cli/utils, cli/formatters → shared
cli/state     → cli/utils, shared
cli/panels    → cli/state, cli/formatters, shared
cli/ink       → cli/panels, cli/state, cli/formatters, shared
cli/commands  → cli/ink, cli/panels, cli/state, cli/formatters, cli/utils, shared

vscode/types     → ()
vscode/utils     → shared
vscode/services  → shared, vscode/types
vscode/providers → vscode/services, vscode/types, vscode/utils, shared
vscode/webview   → vscode/types, shared
vscode/extension → vscode/providers, vscode/services, shared
```

Checker semantics worth knowing before trusting a green result:

- Modules are classified **by path prefix**. Files that match nothing — `vscode/src/settings.ts`,
  `vscode/src/test/` — are **skipped, not failed**.
- A package-level `import ... from 'sidekick-docker-shared'` satisfies any `shared/*` allowance, so CLI and
  VSCode effectively get the whole barrel; sub-module restrictions only bind *inside* the shared package.
- Imports are extracted by regex, so the checker **misses** side-effect imports (`import 'x'`), bare
  `export ... from 'x'` re-exports, and dynamic `await import('x')` — which `extension.ts` uses, and is
  therefore unchecked there.

## Testing Reality

Don't go looking for test infrastructure that doesn't exist. 40 co-located test files (shared 17, cli 15,
vscode 8), **zero `.test.tsx`**, **no `ink-testing-library`**, no `__mocks__`, no `setupFiles`, and **no
coverage tooling at all**. No React component is rendered in any test. The one genuinely shared test double
is `sidekick-docker-vscode/src/test/vscode.ts` (62 LOC), aliased over the `vscode` module for that
package's tests and seeded/inspected via its exported `__mock`; shared and cli have no shared helpers.

Testability comes from deliberately extracting pure logic out of components — `reducer`/`initialState` are
exported from `Dashboard.tsx` specifically so they can be tested headlessly, as are `GLOBAL_BINDINGS` /
`buildHelpBindings` / `buildContextHint` from `keyRegistry.ts`, `OVERLAY_INPUT_HANDLERS`, `windowLines`,
the hit functions in `overlayHitTest.ts` (`contextMenuHit`/`confirmHit`/`sortHit`), `parseMouseEvent`, and
`executeAction`.

Mocking follows three patterns, chosen per file: local `{ ... } as unknown as DockerClient` literals in the
stream/state tests (`EventWatcher`, `DockerState`, `LogStreamManager`, `StatsStreamManager`); `vi.mock()`
module factories, usually with `vi.hoisted()`, in `DockerClient.test.ts`, `connect.test.ts`,
`ContainerWatcherService.test.ts`, and `DockerDashboardProvider.test.ts`; and the aliased `vscode` module
mock for the vscode package.

**Follow that pattern**: extract logic out of the component rather than adding a render harness.
`Dashboard.tsx`'s JSX, every `.tsx` component, `useMouseHandler`, `useKeyboardHandler`, `ExecManager`,
`commands/dashboard.ts`, and all panel files are currently untested — changes there need manual verification.

## Known Technical Debt

- `webview/dashboard.ts` is still large (1097 LOC, ~390 of it renderers; keyboard/overlays/HTML
  extracted to their own modules). `providers/dashboardHtml.ts` is 1132 LOC, nearly all one inline
  `<style>` block. `services/DockerService.ts` is 1069 LOC. `Dashboard.tsx` ~698 LOC
- `noUncheckedIndexedAccess` not yet enabled — 186 errors under each package's own tsconfig (shared 11,
  cli 73, vscode 102; some of vscode's are in `.test.ts`, which only its tsconfig type-checks). Also absent
  are `noUnusedLocals`, `noUnusedParameters`, and `exactOptionalPropertyTypes`
- CI runs none of the quality gates (no lint, no import check, no typecheck) and skips vscode tests —
  local verification is the real gate
- The vscode webview bundle is esbuild `format: 'iife'` but loaded via `<script type="module">` — works,
  but the two disagree
- `esbuild.cjs --production` (minify + drop sourcemaps) exists **only** in `sidekick-docker-vscode`. As of
  0.4.0 it is actually wired up — `vscode:prepublish` → `build:production` → `esbuild.cjs --production` —
  so `vsce package` now ships a minified bundle. The CLI's `esbuild.cjs` still has no argv parsing at all
  (`minify: false` is hardcoded), so `--production` remains a silent no-op there. Both scripts end in
  `.catch(() => process.exit(1))`, swallowing the build error message
- See `specs/_archive/` for refactoring history and `specs/*/design.md` for module design docs
