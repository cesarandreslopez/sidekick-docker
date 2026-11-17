# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# sidekick-docker

Docker management TUI/CLI + VSCode extension.

## Architecture

Monorepo with 3 packages (NOT npm workspaces — each package manages its own deps):

- `sidekick-docker-shared/` — Docker API layer, types, compose detection, the shared state store and stream
  policy, UI-policy formatters. Built with `tsc` to `dist/` (CommonJS + declarations).
- `sidekick-docker-cli/` — TUI dashboard (Ink 7 + React 19). Bundled with esbuild to single ESM binary `dist/sidekick-docker.mjs`.
- `sidekick-docker-vscode/` — VSCode extension. esbuild produces dual output: `out/extension.js` (CJS, Node) + `out/webview/dashboard.js` (IIFE, browser).

Shared must be built first — CLI and VSCode depend on it via local file path (`file:../sidekick-docker-shared`).

`demo/` is not a package: it is a private folder (own `package.json`, Playwright, ttyd, `encode.swift`, gifski) that records
the README/docs GIFs and stills against an isolated `docker:29-dind` daemon on `127.0.0.1:2375` and an invented
`storefront` compose stack — see `demo/README.md`. Outputs sync to `assets/demo/v<N>/` and `docs/images/demo/v<N>/`;
never delete or rename published `assets/` files (including the legacy `assets/*.gif`), since released READMEs keep
loading them. ESLint ignores its `.mjs`, `check-imports.mjs` skips it, and no workflow runs on it.

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
bash scripts/bump-version.sh 0.2.0   # bumps all 4 package.json + 4 package-lock.json files
```

One thing that bites: **no `launch.json` is committed**, so F5 does not "just work". Open
`sidekick-docker-vscode/` as the workspace root (the monorepo root has no extension manifest) and pick
"VS Code Extension Development" from the debugger picker on first run.

The built CLI *is* executable: `esbuild.cjs` chmods `dist/sidekick-docker.mjs` to 0755 after the build, so
the `#!/usr/bin/env node` banner works. Both `esbuild.cjs` scripts print non-esbuild build errors before
exiting 1 (esbuild prints its own).

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
types without checking them, so `tsc --noEmit` is the *only* type gate for those two packages (CI's
`quality` job runs it; run it locally too). `sidekick-docker-shared`'s `build` script *is* `tsc`, so type
errors there also fail the build. There is no root `tsconfig.json`, so running `tsc` from the repo root
checks nothing.

## CI & Release

- **`ci.yml`** — push/PR to `main`, path-filtered to `sidekick-docker-*/**`, `scripts/**`, root
  `package.json`/`package-lock.json`, `eslint.config.mjs` and `ci.yml` itself (edits to *other* workflows
  trigger nothing). Node 22. Jobs: `quality` (lint, `check-imports.mjs`, `tsc --noEmit` ×3),
  `shared-tests`, `cli-tests` (tests, build, `node dist/sidekick-docker.mjs --version`), and
  `build-extension` (vscode tests, build, `scripts/test-packages.mjs` SSH checks, `.vsix` package).
- **`release.yml`** — on tag `v*`. `validate` asserts the tag commit is an ancestor of `origin/main` and
  that root + three package versions equal the tag; `checks` re-runs every gate (lint, imports, tsc ×3,
  all three test suites). Both publish jobs `need` `validate` + `checks`: **Open VSX only (no VS Code
  Marketplace)**, `npm publish` of `sidekick-docker`, then a GitHub Release from the matching CHANGELOG section.
- **`docs.yml`** — `docs/**` or `mkdocs.yml` → `pip install zensical && zensical build` → GitHub Pages.
  No npm script and no pinned Python requirements file; to build docs locally, install zensical yourself.
- **Release flow**: `bash scripts/bump-version.sh X.Y.Z` (rewrites 4 package.json + 4 lockfiles; **does not
  commit or tag**) → update the changelogs → commit → `git tag vX.Y.Z` → push tags.
- **`bump-version.sh` updates the lockfiles as JSON** — `.version`, `.packages[""].version`, and
  `.packages["../sidekick-docker-shared"].version` where present (cli, vscode) — in the root and all three
  packages. Use it rather than editing versions by hand, and never `sed` the lockfiles:
  `@alcalzone/ansi-tokenize` is genuinely `0.3.0`, so a blind version replace corrupts a real dependency pin.
- **Node**: CI and release both pin 22. Only the CLI declares `engines.node` (`>=22.12.0`, raised from
  `>=20` in 0.4.0 for Ink 7 / Commander 15). There is no `.nvmrc` or `.npmrc`.
- **Demos and the Marketplace**: when a release changes what the dashboard or the extension look like, re-record with
  `demo/` (a new `v<N>` folder) after the version bump and before tagging — the status bars show the version. The
  READMEs and docs no longer link to the VS Code Marketplace (its listing is stuck at 0.4.1); VS Code users install the
  `.vsix` from the GitHub Release, everyone else uses Open VSX.

## Stack

- **TypeScript** (strict mode everywhere)
- **Ink 7 + React 19** for TUI
- **esbuild** for CLI/VSCode bundling, **tsc** for shared
- **dockerode** for Docker API, **zod** for validating daemon responses and webview messages
- **Commander.js** for CLI argument parsing
- **vitest** for testing
- **node-pty** for embedded interactive exec (native module, externalized from the bundle and only a
  *devDependency* — the published npm package does not ship it, so npm installs use the `docker exec -it`
  fallback)

## Conventions

- Shared *resource/domain* types (container, image, volume, network, compose, events) live in
  `sidekick-docker-shared/src/types/`. Per-module option/result types stay beside their implementation
  (`DockerClientOptions` in `docker/DockerClient.ts`, `SeverityLevel` in `log/LogAnalytics.ts`) and are
  re-exported through the module barrel and `src/index.ts`
- Docker API interactions go through `DockerClient` facade (never use dockerode directly in CLI/VSCode)
- Streams (logs, stats, events) use `AsyncIterable` with async generators
- Compose operations use `docker compose` CLI (not Docker API)
- UI state uses `useReducer` in Dashboard component; domain state lives in the shared `DockerStateStore`
  (`shared/src/state/`), which the CLI's `DockerState` and VS Code's `DockerService` /
  `ContainerWatcherService` wrap — don't re-implement refresh or event handling in a consumer
- **Action gating and wording are shared UI policy** in `shared/src/formatters.ts` (browser-safe, also
  imported by the webview via `sidekick-docker-shared/formatters`): `canStart`/`canStop`,
  `matchesRunningOnly` (the `a` toggle: running/paused/restarting), `pruneConfirmFor` (count + wording from
  the listed items — prefer it over `pruneCandidateCount`/`pruneConfirmMessage`), `pruneResultText`,
  `removeContainerConfirmMessage`, `removeImageConfirmMessage`, `removeVolumeConfirmMessage`,
  `removeNetworkConfirmMessage`, `composeDownConfirmMessage`, `pruneNothingText` (a prune the listed items
  *prove* would remove nothing → an info toast instead of the red confirm; null whenever the daemon might still
  remove something: an unknown volume scope, any untagged image (digest-only images are pruned by the graphdriver
  store), any non-default network (one with only stopped containers is pruned)),
  `containerStateGroup`/`containerStateRank` (Running = exactly what `matchesRunningOnly` keeps; the webview list
  and the tree both group by it), `emptyLogMessage` (why a log pane is empty), `imageDisplayName` (`<none> (id)` for
  untagged), `sortDirectionLabel`, `publishedPortUrls`/`browserHostForEndpoint`, `actionText` +
  `actionFailedText(type, name, message)`, plus the Config-tab helpers (`summarizeHealth`,
  `summarizeRestartPolicy`, `formatMount`). Change behaviour there so both surfaces move together
- **Volume prune is anonymous-only on Engine 23+ (API ≥ 1.42).** `DockerClient.getApiVersion()` reads the
  daemon version once per client (failures not cached) and every `VolumeInfo` carries `anonymous` (the
  `com.docker.volume.anonymous` label) and `pruneScope` (`anonymous`/`all`/`unknown`), so the browser-safe
  prune wording can count honestly. `removeImage` untags a multi-tag image by name (Docker refuses delete-by-ID
  with several tags), refuses up front if any container descends from it, and reports half-removed tags.
  Untagged images: API ≥ 1.43 sends `RepoTags: []`; use `realImageTags` (`docker/utils.ts`). Start/stop treat
  304 (already in that state) as success. `errorMessage` strips docker-modem's `(HTTP code N) reason - ` wrapper,
  so toasts carry the daemon's own message. `formatTimestampTime` is **local** time (it was a UTC slice)
- VI keybindings: j/k navigation, g/G (and Home/End) top/bottom, h/l focus, 1-5 panel switch, [/] detail tabs,
  PgUp/PgDn + Ctrl+D/U paging, Ctrl+R refresh, `w` wrap long detail lines (same key in the webview, where wrap
  defaults on), `M` mouse-capture toggle (`--no-mouse` starts it off, so the terminal can select text).
  TUI global bindings live in `ink/keyRegistry.ts` — the single source of truth driving dispatch, the help
  overlay, and status-bar hints; add new global keys there, not in `useKeyboardHandler`
- **`keyRegistry` matching is first-hit.** `useKeyboardHandler` runs the first binding whose `match()`
  returns true, so order matters only between bindings whose predicates overlap — today none do
  (`keyRegistry.test.ts` asserts every key resolves to exactly one binding, and `ink/keyConflicts.test.ts`
  builds the five real panels and fails if a global shadows any `getActions()` key). When adding a global key,
  check that no earlier binding already matches it, and note that a global whose `isAvailable` is false
  swallows the key with a "Not available here" toast rather than falling through to a panel action.
  Panel action shortcuts (`getActions()` keys) fire directly, without the `x` menu, but never on a
  Ctrl/Meta chord (`findPanelAction`). **Globals go through `findGlobalBinding(input, key)`**: while Ctrl or
  Meta is held only bindings marked `chord: true` (Ctrl+R, Ctrl+D/U, Ctrl+C) can match, so Ctrl+Z/Ctrl+Q/Alt+x
  never run `z`/`q`/`x`; the Actions menu and the confirm (`overlayInput.ts`) apply the same rule (Ctrl+Y does not
  confirm). A held `j`/`k` can arrive as one `"jjj"` input — navigation moves by the run length through reducer
  deltas (never by looping a binding: `ctx` values are stale closures); mixed text is ignored, so a paste never
  fires commands. While the too-small screen shows, only `q`/Ctrl+C act. Filter prompts drop control characters
  (`stripControlCharacters`, `ink/inputText.ts`)
- Confirmation modal required for all destructive actions (remove, prune); confirm messages
  name their target (`confirmMessage` accepts a function of the item) — prunes name a count, removing a
  running container says it is force-stopped first; Enter cancels (safe default)
- **Panel action handlers returning a string set the success-toast text** (e.g. "Pruned — 1.2 GB
  reclaimed"); returning nothing falls back to the action label. `confirm: true` stores the wrapped
  closure in reducer state instead of executing it — clearing that closure is what closes the modal
- **Boxed overlays paint every cell**: `backgroundColor={OVERLAY_FILL}` (`theme.ts`, the unknown colour
  `'none'` — Ink fills the box with unstyled spaces, so log text no longer shows through padding). Any new
  boxed overlay needs it; `ink/overlayFill.test.ts` pins the behaviour with Ink's `renderToString`
- **Overlay geometry is shared with mouse hit-testing.** `ink/overlayHitTest.ts` exports both the origins
  the overlay components render at *and* the hit functions `useMouseHandler` uses. Change an overlay's
  JSX rows and you must update the matching hit function, or clicks silently miss. Confirm messages wrap
  (≤3 lines) through one pure function both sides call. **Never render `<Text>{''}</Text>` as a spacer** —
  Ink measures empty text as zero rows, so the row collapses and everything below shifts (this put the
  confirm buttons two rows above their hit targets); use `' '`
- **TUI lifecycle** (`commands/dashboardLifecycle.ts`): the dashboard renders with
  `{ alternateScreen: true, exitOnCtrlC: false, stdout: inkStdout() }` — `inkStdout` is a Proxy over
  `process.stdout` whose `write` strips `ESC[3J` (Ink's full-screen clear would otherwise erase the user's
  scrollback, terminal-dependent even from the alt screen). Ink itself leaves/re-enters the alt screen around
  `suspendTerminal`. Signals exit 128+signo (`signalExitCode`; SIGINT/SIGTERM/SIGHUP); the fatal guard unmounts
  (leaving the alt screen) *before* printing, else the message vanishes with the alt screen. Ctrl+C is handled by
  `useKeyboardHandler` (so it reaches an embedded exec shell). During the `docker exec -it` fallback
  `pauseTerminalRead` stops Node's pending TTY read (private `stdin._handle.readStop/readStart`, mirroring
  `net.Socket#pause`) — Ink's suspend leaves it armed and the dashboard would steal the shell's keystrokes.
  `Connecting to <endpoint>…` goes to stderr before the ping
- **Log text is sanitised before it is filtered or drawn** (`sanitizeLogText`, `cli/src/formatters.ts`):
  tabs expanded, CR/BEL/other C0 dropped (Ink measures a tab as 0 columns), app SGR kept only when colour is on;
  filtering and highlighting run on the plain text. stderr lines keep token colouring plus a dim `┃` gutter.
  Wrapping (`w`) is a pure pre-wrap of the detail lines *before* scroll/window math (never Ink `wrap="wrap"`,
  which breaks the row budget and mouse rows); off in compare mode
- **Selection-driven work settles first** (`commands/viewTargets.ts`): the first view applies at once; after
  that the old selection's streams stop immediately and the new log/inspect/stats starts once the selection has
  been still for `VIEW_SETTLE_MS` (150). `docker diff` is fetched only when the Files tab is active; Ctrl+R
  drops the selected item's cached details/changes. EventWatcher errors trigger a refresh, and while
  disconnected the consumer polls every ~5 s (the store stays passive)
- **Panel actions can decline before confirming**: `PanelAction.nothingToDo(item)` returning a string shows it as
  an info toast and skips the confirm (prunes use the shared `pruneNothingText`). `executeAction` ignores a
  second press of the same action+target while its progress toast is live (the target is
  `runKey ?? targetName ?? item.id` — set `runKey` when the display name repeats, as Services' `web` does across
  projects); the Actions-menu cursor is stored as
  the action *key*, not an index, so a refresh cannot move it onto a different action
- **TUI selection is by id.** The reducer keeps `selectedItemId` beside the index; `RESOLVE_SELECTION`
  re-finds it after refresh/sort/filter without resetting scroll, and a vanished item falls back to
  `SELECT_ITEM` (which does reset). Sorting and filtering are pure (`ink/listModel.ts`); list row layout —
  middle truncation keeping `-N`/`:tag`, the separate `badge` field — is `ink/sideListLayout.ts`.
  `PanelItem.name` is the plain name for toasts/headers (the label is decorated); `PanelAction.actionType`
  lets `executeAction` word progress/success/failure through the shared `actionText`/`actionFailedText`.
  Mouse reports that Ink hands `useInput` as text are dropped first thing in `useKeyboardHandler`
- CLI colors are gated centrally in `sidekick-docker-cli/src/formatters.ts`
  (NO_COLOR/FORCE_COLOR/isTTY + `--no-color`); never emit raw ANSI directly. TUI colour tokens live in
  `sidekick-docker-cli/src/theme.ts` (`ACCENT` `#5B8BD9` for text/borders/selection, `ACCENT_FILL` navy
  behind white text). ESLint bans hex colour literals and raw ANSI escapes under
  `sidekick-docker-cli/src/dashboard/**` (tests excepted) — use a theme token or the `ansi.*` helpers.
  **Ink's chrome is coloured by chalk, which honours `FORCE_COLOR` and the `--no-color` argv flag but not
  `NO_COLOR`** — so the esbuild banner maps `NO_COLOR` → `FORCE_COLOR=0` before any module loads. Both
  `NO_COLOR` and `--no-color` therefore make the whole TUI monochrome (only in the bundle, not under vitest)
- **There is no `exec` method on `DockerClient`** — exec is implemented per consumer. CLI uses node-pty
  via `dashboard/ExecManager.ts` (dynamic `import('node-pty')`; returns `false` when the native module is
  missing — the normal case for npm installs — falling back to suspending Ink and spawning
  `docker exec -it`). The shell is `--shell` → `SIDEKICK_DOCKER_SHELL` → `/bin/sh`
  (`dashboard/execShell.ts`, which also explains a missing shell). Ctrl+] detaches the embedded session
  (Ink delivers stdin as utf8 strings, so match `'\x1d'`, not a byte). VSCode creates a `vscode.Terminal`
  with `shellPath: 'docker'` and `exec.defaultShell`
- **Endpoint resolution lives in `shared/src/docker/endpoint.ts`** — `parseDockerEndpoint`,
  `describeDockerEndpoint` (the default is described as `defaultDockerSocket()`, which mirrors docker-modem: the
  Windows named pipe, else Docker Desktop's `~/.docker/run/docker.sock` when present, else `/var/run/docker.sock`),
  and `dockerCliEnv` (which exists because spawned `docker compose` subprocesses
  don't inherit dockerode's endpoint). There is **no `docker context` detection** anywhere in the repo
- **Zod guards both trust boundaries**: `shared/src/docker/schemas.ts` validates raw daemon responses;
  `vscode/src/types/messageSchemas.ts` (`WebviewMessageSchema`) `safeParse`s every inbound webview message.
  That schema is hand-written alongside the `WebviewMessage` union — update both together; the
  compile-time `WebviewMessageSchemaInSync` assertion makes any drift fail `tsc --noEmit`
- VSCode settings are read only through `sidekick-docker-vscode/src/settings.ts`;
  action feedback goes through `providers/actionRegistry.ts` (`runDockerAction`)
- **VSCode has two independent surfaces** — the TreeView (`ContainerWatcherService`, its own `DockerClient`
  and a containers-only `DockerStateStore`) and the webview dashboard (`DockerDashboardProvider`, its own
  `DockerService` with a full store). They poll separately; the dashboard stops polling while hidden
- **VS Code connection lifecycle**: the dashboard reconnects only when the always-on watcher sees Docker come back
  (`onConnectionChanged(true)` → `dashboardProvider.retryIfDisconnected()`) or the panel becomes visible — never a
  dashboard timer. `retryIfDisconnected` is a no-op unless the panel exists, the webview is ready, there is no
  service and no connect in flight (`initializing` + `initGeneration`). `_initializeService` posts
  `connectionState: 'connecting'`; the webview keeps the stale list inert (keys except `?`/`V` blocked) until
  `connected`. A watcher rebuild (endpoint/trust) clears the tree and shows connecting (`rebuildWatcher` in
  `extension.ts`); a refresh-interval change applies in place (`setRefreshInterval`) so logs and sparklines survive.
  The status-bar text/tooltip is the pure `providers/statusBar.ts`; palette pickers refuse while offline through
  `providers/connectionGuard.ts` (`requireConnected`, reason + Retry)
- **Compose actions in VS Code** run through `providers/composeRunner.ts`: output streams (shared
  `ComposeCommandOptions.onOutput`) into one lazily created `LogOutputChannel` "Sidekick Docker"; up/down/restart
  progress is cancellable (token → `AbortSignal` → `runProcess`); a cancelled run (`ComposeError.cancelled`) is
  reported as info, never "Failed to…"; failures offer "Show Output". `providers/inFlight.ts` ignores a repeated
  action+target (tree, palette and dashboard). A dashboard action failing while the panel is hidden also raises a
  native notification ("Open Dashboard")
- **`socketPath` and `exec.defaultShell` are `machine-overridable`** as well as restricted: in a remote window they
  come from the remote's settings, so a local path does not follow the user into Remote-SSH/WSL/Dev Containers
- **Tree menu `when` clauses list container states explicitly** (`/^container-(running|paused|…)$/`) —
  never `/^container-/`, which also matches the group header (`container-group`). Command handlers take
  their target through `containerIdFromArg` (an `instanceof ContainerTreeItem` guard). `getSettings()` has
  no side effects; an invalid `socketPath` is reported once by `warnIfInvalidEndpoint()` and reads as `''`
- **Dashboard F5** is a contributed keybinding (`sidekick-docker.refreshDashboard`, hidden from the
  palette) scoped to `activeWebviewPanelId == 'sidekick-docker.dashboard'` and off while a debug session
  is stopped or another part has focus; the webview has no F5 handler of its own (it would double-refresh)
- **Webview re-renders compare HTML strings, not `innerHTML`** (`replaceContent` keeps the last string
  per root in a WeakMap — the DOM serializes `<input />`/boolean attributes differently, so `innerHTML ===
  html` never matched). Same-item log updates go through the patch functions; a full ring buffer drops
  nodes from the top (`droppedLogPrefix` in `webview/state.ts`) and compensates `scrollTop`. Detail tab
  indices the host relies on live in `src/types/detailTabs.ts` (pinned by tests on both sides)
- **`socketPath` and `exec.defaultShell` are `restrictedConfigurations`** in the extension manifest: VS Code
  ignores workspace values for them until the folder is trusted, and `onDidGrantWorkspaceTrust` rebuilds
  the watcher and dashboard service. Compose is refused in untrusted workspaces (tree menu items are hidden
  via `isWorkspaceTrusted`)
- **Webview CSP is `default-src 'none'` with a nonce-only `script-src`.** HTML is built by string
  templating, so every interpolation must go through `escapeHtml`/`escapeAttr` in `webview/formatters.ts`
- Tests are co-located as `.test.ts` files (one `.test.tsx`)

## Key Entry Points

| What | File |
|------|------|
| CLI entry | `sidekick-docker-cli/src/cli.ts` (Commander.js setup) |
| Dashboard action | `sidekick-docker-cli/src/commands/dashboard.ts` (wires everything) |
| TUI lifecycle (alt screen, exit codes, fatal guard) | `sidekick-docker-cli/src/commands/dashboardLifecycle.ts` |
| TUI selection settle / stream targets | `sidekick-docker-cli/src/commands/viewTargets.ts` |
| Main TUI component | `sidekick-docker-cli/src/dashboard/ink/Dashboard.tsx` |
| Panel interface | `sidekick-docker-cli/src/dashboard/panels/types.ts` (`SidePanel`) |
| Domain state (CLI wrapper) | `sidekick-docker-cli/src/dashboard/DockerState.ts` |
| Shared state store + event policy | `sidekick-docker-shared/src/state/DockerStateStore.ts` + `eventPolicy.ts` |
| Follow/reconnect policy | `sidekick-docker-shared/src/events/FollowStream.ts` (+ `LogResumeCursor.ts`) |
| Stream manager base | `sidekick-docker-cli/src/dashboard/BaseStreamManager.ts` |
| TUI colour tokens | `sidekick-docker-cli/src/theme.ts` |
| Shared UI policy (gating, confirms, sort labels) | `sidekick-docker-shared/src/formatters.ts` |
| Docker facade | `sidekick-docker-shared/src/docker/DockerClient.ts` |
| Endpoint / DOCKER_HOST parsing | `sidekick-docker-shared/src/docker/endpoint.ts` |
| Shared exports | `sidekick-docker-shared/src/index.ts` |
| TUI keybinding registry | `sidekick-docker-cli/src/dashboard/ink/keyRegistry.ts` |
| VSCode activation | `sidekick-docker-vscode/src/extension.ts` |
| VSCode Docker state owner | `sidekick-docker-vscode/src/services/DockerService.ts` |
| Webview provider | `sidekick-docker-vscode/src/providers/DockerDashboardProvider.ts` |
| VS Code compose runner + output channel | `sidekick-docker-vscode/src/providers/composeRunner.ts` |
| Webview HTML/CSS template | `sidekick-docker-vscode/src/providers/dashboardHtml.ts` |
| Webview panel interface | `sidekick-docker-vscode/src/webview/panels/types.ts` (`PanelDefinition`) |
| Webview message protocol | `sidekick-docker-vscode/src/types/messages.ts` + `messageSchemas.ts` |
| VSCode settings reader | `sidekick-docker-vscode/src/settings.ts` |
| Lint config | `eslint.config.mjs` (root, covers all 3 packages) |

## Key Patterns

- **Panel system**: Implement `SidePanel` interface for each resource type. Panels define `getItems()`, `detailTabs[]` with render functions, and `getActions()` (per-item shortcuts, confirm metadata, handlers that may return a success-toast string). Panel-contextual *global* keys (filter, sort, compare) belong in `ink/keyRegistry.ts`. The VSCode webview mirrors this with its own `PanelDefinition` in `webview/panels/types.ts` — the two are parallel, not shared.
- **State flow**: Docker events → `EventWatcher` (one loop across stop/start) → `DockerState.processEvent()` → shared `DockerStateStore.processEvent()` → store `onChange` (for an event only when it changed something; every refresh pass fires it, even a timed-out one) → stream managers' `targetStateChanged()` + `scheduleRender()`. The store is passive (callers own the event stream and the 30s fallback interval) and its snapshot arrays are replaced, never mutated. Event policy is the pure `classifyEvent`/`applyEffect` in `state/eventPolicy.ts`: healthcheck `exec_*`, attach/resize/kill/oom, volume mount/unmount and daemon events are ignored; `health_status` patches in place; start/unpause/restart patch then re-sync; stop/die/pause patch; destroy removes; create/rename/update/unknown verbs and image/volume/network changes request a refresh debounced 500ms (same in both surfaces). A refresh pass always commits — events arriving mid-fetch are journalled and replayed over the fetched lists — does **one** container listing (`DockerClient.listResources()`), reads compose config through `CachedComposeFileReader` (spawns `docker compose config` only when the compose files change), and is abandoned after 20s, keeping previous data and setting `resourceErrors`. Ctrl+R calls `refresh({ reloadCompose: true })`. See `specs/state/design.md`.
- **Stream managers**: Three classes (`LogStreamManager`, `ComposeLogStreamManager`, `StatsStreamManager`) extend `BaseStreamManager`, which owns selection and delegates the reconnect policy to the shared `FollowStream` (one instance per selection). Subclasses implement eight abstract members — `streamLabel`, `emptyId`, `isSameId`, `isValidId`, `idLabel`, `createStream(id, signal, attempt: { reconnect })`, `processItem`, `onClear` — plus optional `acceptItem` (drop replayed items) and `onBeforeStream`/`onStop` hooks. Constructors take `{ isTargetRunning }` so the stream knows whether its target is stopped; `targetStateChanged()` resumes a finished stream and `getStreamState()` exposes the `FollowStreamState`. `commands/dashboard.ts` instantiates five managers from those three classes: primary + secondary (compare-mode) container logs, primary + secondary compose logs, and stats. VS Code uses the same `FollowStream` via `services/LogSlot.ts` (and directly for stats).
- **FollowStream policy** (`shared/src/events/FollowStream.ts`): when a source ends and its target is known to be stopped → `ended`/`empty`, no reconnect (stopped containers used to be re-requested every 2s, duplicating the tail); otherwise reconnect with exponential backoff (2s → 30s, 10 attempts, then `error`); backoff resets only after an attempt delivers an accepted item; `resume()` restarts a finished stream once the target runs. Log reconnects ask for `since` the `LogResumeCursor` position and drop same-millisecond replays.
- **Process & request deadlines**: compose subprocesses go through `runProcess` (`shared/src/compose/process.ts`; StringDecoder per stream, SIGTERM→SIGKILL, resolves with exit 124 on timeout): compose queries 30s, actions 15 min, `compose config` 10s. `DockerClient` non-streaming reads honour `requestTimeoutMs` (default 30s; streams exempt) and throw `DockerTimeoutError`.
- **Stats streaming**: Selection-driven (expensive). `StatsStreamManager.select(id)` starts stream → pushes to `StatsCollector` ring buffer (60 samples) → sparklines. Only streams when the Stats tab is active or the sort field needs live data.
- **Log streaming**: Selection-driven. `LogStreamManager.select(id)` starts stream → ring buffer (1000 lines).
- **Render throttling**: `scheduleRender()` batches at 200ms and **drops the frame** when `process.stdout.writableLength > writableHighWaterMark` (backpressure guard); stream callbacks add a further 100ms flush debounce. `SIDEKICK_DEBUG_STREAMS=1` dumps heap/stdout diagnostics every 60s.
- **Compose detection**: Primary from container labels (`com.docker.compose.*`), secondary from `docker compose config`. Merged to show running + planned services.
- **esbuild** (CLI): bundles `ssh2` with its optional native accelerators (`cpu-features`, `sshcrypto.node`) stubbed to throw so ssh2 uses its JS fallback (`scripts/native-fallbacks.cjs`, shared with vscode); stubs `react-devtools-core`; externalizes `node-pty`; injects `__CLI_VERSION__`; the banner adds the shebang and the `NO_COLOR` → `FORCE_COLOR=0` mapping; the output is chmodded 0755.
- **VSCode webview protocol**: Extension ↔ webview communicate via `postMessage()` with typed messages defined in `sidekick-docker-vscode/src/types/messages.ts` (13 `ExtensionMessage` extension→webview, 15 `WebviewMessage` webview→extension variants — `copyText` copies a toast; `copyLogs` is only for logs). `connectionState` is `connecting | connected | disconnected` (the webview treats anything but `connected` as a stale list). `updateChanges` carries the host's `fetchedAt`; the snapshot's optional `composeAllowed` hides compose actions in untrusted workspaces. Lazy detail loads use `DetailKind = 'inspect' | 'changes' | 'layers'`; `inspect` is one `DockerClient.getContainerDetails()` call (env, restart policy + count, mounts, exit code/OOM/error, health log) delivered as `updateInspect` (formerly `updateEnv`).

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
| state | `shared/src/state/` | docker, compose, types | — |
| core | `shared/src/` (root) | **all seven sub-modules** | `sidekick-docker-shared/formatters` |
| integration | `shared/src/integration/` | (test-only, no barrel) | — |

`core` is the root-level files (`index.ts`, `formatters.ts`, `errors.ts`, `branding.ts`, `phrases.ts`) and
may import everything — `formatters.ts` genuinely depends on `docker/utils`. `integration/` holds
`module-boundaries.test.ts`, which asserts barrel-export completeness and sub-path reference identity;
`check-imports.mjs` classifies it as `shared/core` by fall-through. `state/` needs compose (detector +
config reader), which is why it is its own module rather than part of `events/`.

### Enforced Dependency DAG

Transcribed from `ALLOWED_DEPS` in `scripts/check-imports.mjs` — keep these in sync:

```
shared/types  → ()                          [leaf]
shared/log    → ()                          [leaf]
shared/docker, shared/compose, shared/stats → shared/types
shared/events → shared/docker, shared/types
shared/state  → shared/docker, shared/compose, shared/types
shared/core   → all seven sub-modules

cli/utils, cli/formatters → shared         (cli/src/theme.ts is classified as cli/formatters)
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

Don't go looking for test infrastructure that doesn't exist. 92 co-located test files (shared 27, cli 46,
vscode 19), **no `ink-testing-library`**, no `__mocks__`, no `setupFiles`, and **no coverage tooling at all**.
Three tests render real UI, all without a harness library: `cli/src/dashboard/ink/overlayFill.test.ts` renders
overlays over filler text with Ink's `renderToString` to prove `OVERLAY_FILL` hides what is beneath; `cli/src/dashboard/ink/execFallback.test.tsx` (the
only `.test.tsx`) mounts `Dashboard` with Ink's own `render()` over `PassThrough` streams, mocking
`ExecManager`/mouse/terminal-size; `vscode/src/providers/dashboard.dom.test.ts` esbuild-bundles the webview
and runs it in `jsdom`. The one genuinely shared test double is `sidekick-docker-vscode/src/test/vscode.ts`
(`workspace` incl. `isTrusted`, `window` incl. `showQuickPick`/`withProgress` (with cancellation tokens)/
`createOutputChannel`/`setStatusBarMessage`, `Uri.parse`/`joinPath`, `env.asExternalUri`/`openExternal`/`clipboard`,
`TreeItem`/`ThemeIcon`/`ThemeColor`), aliased over the `vscode` module for that package's tests and seeded/inspected via its
exported `__mock`; shared and cli have no shared helpers.

Testability comes from deliberately extracting pure logic out of components — `reducer`/`initialState` are
exported from `Dashboard.tsx` specifically so they can be tested headlessly, as are `GLOBAL_BINDINGS` /
`buildHelpBindings` / `buildContextHint` from `keyRegistry.ts`, `OVERLAY_INPUT_HANDLERS`, `windowLines`,
the hit functions in `overlayHitTest.ts` (`contextMenuHit`/`confirmHit`/`sortHit`), `parseMouseEvent`, and
`executeAction`.

Mocking follows three patterns, chosen per file: local `{ ... } as unknown as DockerClient` literals in the
stream/state tests (`EventWatcher`, `DockerStateStore`, `DockerState`, `LogStreamManager`,
`StatsStreamManager`); `vi.mock()` module factories, usually with `vi.hoisted()`, in `DockerClient.test.ts`,
`ComposeStreaming.test.ts`, `connect.test.ts`, `execFallback.test.ts(x)`, `ContainerWatcherService.test.ts`,
`DockerService.test.ts`, and `DockerDashboardProvider.test.ts`; and the aliased `vscode` module mock for the
vscode package. Pure policy is tested directly: `eventPolicy`, `FollowStream`, `LogResumeCursor`,
`runProcess`, `ComposeConfigCache`, and the shared UI-policy formatters.

**Follow that pattern**: extract logic out of the component rather than adding a render harness (recent
examples: `listModel.ts`, `sideListLayout.ts`, `helpLayout.ts`, `toastLayout.ts`, `execOutput.ts`,
`execShell.ts`, `buildStatusSegments` in `StatusBar.tsx`, `copyLogsAction` in `panels/types.ts`; in VS Code
`droppedLogPrefix`, `composeGroupTooltip`, `splitReplicaSuffix`). Apart from the one exec-fallback render test,
`Dashboard.tsx`'s JSX, the `.tsx` components, `useMouseHandler`, `useKeyboardHandler`, `ExecManager`,
`commands/dashboard.ts`, and the panel classes are untested — changes there need manual verification.

## Known Technical Debt

- `webview/dashboard.ts` is still large (1521 LOC; keyboard/overlays/HTML extracted to their own modules).
  `providers/dashboardHtml.ts` is 1319 LOC, nearly all one inline `<style>` block.
  `services/DockerService.ts` is 879 LOC now that refresh/event policy lives in `DockerStateStore`
  and log streams in `LogSlot`. `Dashboard.tsx` ~851 LOC
- `noUncheckedIndexedAccess` not yet enabled — 213 errors under each package's own tsconfig (shared 20,
  cli 73, vscode 120; some of vscode's are in `.test.ts`, which only its tsconfig type-checks). Also absent
  are `noUnusedLocals`, `noUnusedParameters`, and `exactOptionalPropertyTypes`
- The vscode webview bundle is esbuild `format: 'iife'` but loaded via `<script type="module">` — works,
  but the two disagree
- `esbuild.cjs --production` (minify + drop sourcemaps) exists **only** in `sidekick-docker-vscode`. As of
  0.4.0 it is actually wired up — `vscode:prepublish` → `build:production` → `esbuild.cjs --production` —
  so `vsce package` now ships a minified bundle. The CLI's `esbuild.cjs` still has no argv parsing at all
  (`minify: false` is hardcoded), so `--production` remains a silent no-op there
- See `specs/_archive/` for refactoring history and `specs/*/design.md` for module design docs
