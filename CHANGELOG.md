# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [Unreleased]

### Fixed

- Preserve split JSON records and UTF-8 characters in Docker stats, events, and logs; decode live TTY logs without multiplex headers.
- Cancel obsolete streams when selections change, views hide, or services are disposed. Empty streams stop retrying after the reconnect budget is exhausted.
- Keep the VS Code list selection, details, and action target aligned after filtering or refresh, and preserve the current detail tab when selecting another item.
- Respect modified keyboard shortcuts and native Tab traversal in the webview. Sort choices support clicks; modal dialogs confine focus and background updates preserve the focused control.
- Refresh pinned log comparisons when only the secondary container or service produces output.
- Preserve Compose override file order for lifecycle actions, report missing configuration files, and show running/total replicas for scaled services.
- Suspend the existing Ink session for fallback exec so returning from the shell retains dashboard state.
- Restore SSH connections in the packaged CLI and extension by bundling the real SSH transport.
- Coalesce concurrent refreshes, retain successful resource data on partial failures, and prevent pending watcher work from publishing after disposal.

### Added

- Detail-load and stream status messages with Retry controls in the VS Code dashboard; partial refresh warnings in both dashboards.
- DOM regression tests and `npm run test:packages` for SSH checks against the npm tarball and production VSIX.

## [0.4.0] - 2026-07-24

### Fixed

- **Sorting containers by CPU, memory, network, block I/O or PIDs compared
  zeros.** Stats are streamed one container at a time by design, so the
  collector held no sample for any unselected row. A new one-shot sampler fills
  every running container while a stats sort is active.
- **Failed operations reported success.** `docker compose` exit codes and
  stderr were discarded at every call site, so a failed `up` rendered the
  success toast. Clipboard failures reported "Copied N lines" with no clipboard
  tool installed. VSCode discarded prune results and could not report reclaimed
  space.
- **Networks never listed their containers.** Docker's `GET /networks` omits
  the container map, so every network reported zero attachments — which also
  meant the "cannot remove a network in use" guard never fired. Attachments are
  now derived from the container listing.
- **Compose actions ran in the wrong directory (CLI).** The panel used the
  process's working directory for every project instead of the project's own
  recorded location.
- **`--socket` and the `socketPath` setting were ignored by spawned `docker`
  processes.** Compose and exec inherited the ambient environment, so they
  could target a different daemon than the one on screen.
- **VSCode log and stats streams never recovered.** A container restart ended
  them permanently while the pane still looked live.
- **`console.debug` corrupted the TUI.** Nine call sites wrote to stdout while
  Ink owned the screen. Diagnostics now go to stderr behind
  `SIDEKICK_DEBUG_STREAMS`.
- **Detail tabs could sit on "Loading…" forever.** Env, Files and Layers
  swallowed fetch errors; they now show what failed.
- **Tab bars wrapped into three rows at 80 columns**, and every list row
  silently lost its leading character to an off-by-one in the width budget.
- Moving through the list no longer resets the detail pane to Logs.
- Doubled `⚡` in the TUI brand mark.

### Added

- `sidekick-docker images`, `volumes`, `networks`, `stats`, `df` and `inspect`
  — scriptable commands following the existing `ps` contract.
- Container prune in both surfaces; images, volumes and networks already had it.
- `DockerClient.diskUsage()` (`docker system df`), including build cache, which
  was reported nowhere.
- Labels tab for containers, and network addressing (subnet, gateway, IPAM,
  per-container IPs) in the Networks Info tab.
- Volume Info lists the containers mounting each volume.
- VSCode: `Exec into Container...` and `Show Container Logs...` commands,
  reachable from the tree and the command palette. Exec was previously
  reachable only from inside the webview, despite a documented
  `exec.defaultShell` setting.
- VSCode: clicking a tree item opens it; unhealthy and starting containers are
  now visually distinct.

### Changed

- **BREAKING (CLI):** requires Node >= 22.12.0. Ink 7 and Commander 15 need it,
  and Node 20 is end-of-life.
- Dependencies: Ink 7, Commander 15, dockerode 5, TypeScript 6.0.3, Vitest 4,
  ESLint 10, `@types/dockerode` 4. TypeScript 7 is deferred while
  typescript-eslint's peer range excludes it.
- Removed the unused `js-yaml` runtime dependency from the shared package.
- `@types/vscode` is pinned to match `engines.vscode`, which it previously
  floated 24 minor versions above.
- VSCode declares `extensionKind: workspace`, so Remote-SSH and dev-container
  sessions target the remote daemon; and ships a minified bundle via a
  `vscode:prepublish` hook that was missing.
- VSCode runs in an untrusted workspace with `untrustedWorkspaces: "limited"`.
  Containers, images, volumes and networks behave normally; compose is disabled,
  because `docker compose config`/`up` reads and executes a compose file the
  workspace itself controls. Previously the extension was disabled outright in
  Restricted Mode.
- Accessibility: the webview list now takes focus so screen readers announce
  selection, decorative glyphs are hidden, mouse-only affordances became real
  buttons, and modal overlays manage focus.
- Both surfaces work outside a dark theme: hardcoded status colours became
  theme variables, and the TUI inherits the terminal's own foreground.

## [0.3.0] - 2026-07-10

### Added

#### CLI

- `ps --format <table|json>` and `-q`/`--quiet` for scripting; table output is width-aware on a TTY and uses natural widths when piped
- `logs --no-follow`; `-f` now defaults on only when attached to a terminal, so piped `logs` output terminates instead of hanging — non-follow output is demultiplexed with correct stderr tagging
- Root `--no-color` flag; colored output honors `NO_COLOR`, `FORCE_COLOR`, and TTY detection — no more raw escape codes in piped/CI output
- Root `--verbose` flag — errors print one friendly line by default, full details with `--verbose` or `DEBUG`
- `--socket` accepts `unix://` and `tcp://`/`http://`/`https://` URLs in addition to bare socket paths, and is now honored by `ps` and `logs` (previously silently ignored outside the dashboard)
- Paging keys: `PgUp`/`PgDn` scroll a full page, `Ctrl+D`/`Ctrl+U` a half page; `l`/`→` enters the detail pane (vim symmetry with `h`)
- Log follow-pause — scrolling up on a logs tab pauses tailing (`⏸ follow paused — G to resume`); reaching the bottom or `G` resumes
- Stacked toasts — up to 3 recent toasts render below the tab bar instead of overwriting each other; failure toasts carry the actual Docker error text
- Mouse support — click to select items and switch panel/detail tabs, clickable overlay buttons (confirm Yes/No, menu and sort rows), right-click opens the actions menu; clicking outside cancels
- Connection-aware empty states (`Connecting to Docker…`, `Docker daemon unreachable`) and actionable daemon-unreachable hints mapped from `EACCES`/`ENOENT`/`ECONNREFUSED`/`ETIMEDOUT`
- Pressing a global key that isn't available in the current context shows a `Not available here` toast instead of silently doing nothing

#### VSCode

- Extension settings — `sidekick-docker.socketPath` (socket path, `unix://`, or `tcp://host:port`), `refreshIntervalSeconds`, `statusBar.visible`, and `exec.defaultShell`; socket/refresh changes apply live without a reload, and an invalid `socketPath` warns instead of silently connecting to the default
- Dashboard survives window reloads — active panel, selection, detail tab, sort, layout, and filter are restored
- `Sidekick Docker: Open Dashboard to the Side` command; default keybindings — `Ctrl+Alt+D` opens the dashboard (all platforms), `Ctrl/Cmd+Alt+R` refreshes the tree
- Tree view: per-state context menus (Restart, Pause, Unpause, Remove with a naming modal), compose project sub-groups with container counts, and welcome states — "Docker daemon is not reachable" with a Retry button, and a real "No containers found" view
- Dashboard mouse actions — right-click a row or click its `⋯` button to open the actions menu at the pointer; clickable status-bar hint chips; overlays close on outside click
- Keyboard parity with the TUI — `m` pins the compare pane, `f` focuses the log filter, `Shift+J`/`Shift+K` scroll the compare pane, `F5` refreshes, `PgUp`/`PgDn` and `Ctrl+D`/`Ctrl+U` page
- Connection-aware dashboard — skeleton rows and a pulsing `connecting…` dot while connecting; a persistent banner with Retry when the daemon is down
- Health badges on container rows (`✓`/`✗`/`◌`); sticky error toasts with Copy and dismiss buttons
- Accessibility — ARIA roles and selection states, `aria-live` toasts and connection status, visible focus outlines, `prefers-reduced-motion` support, and a text band on stat bars so color is not the only overload signal

#### Shared

- `parseDockerEndpoint()` — parses bare socket paths, `unix://`, and `tcp://`/`http://`/`https://` URLs into client options; `https` is selected for the `https://` scheme or the scheme-ambiguous `tcp://` on port 2376
- `describeDockerEndpoint()` and `explainDockerUnreachable()` — human-readable endpoint descriptions and errno-mapped one-line hints for connection failures
- `DockerClient.pingDetailed()` — preserves the underlying error so callers can explain why the daemon is unreachable; `errorCode()` extracts Node errno codes
- `dockerCliEnv()` — `DOCKER_HOST`/`DOCKER_TLS_VERIFY` overrides so spawned `docker` CLI processes (compose) target the same endpoint as the API client
- `ComposeClient` accepts environment overrides for spawned `docker compose` processes; `ComposeDetector` records each project's source directory and config files from compose labels
- `protocol?: 'http' | 'https'` option on `DockerClientOptions` for TLS connections to remote daemons

### Changed

#### CLI

- Confirm modals are safe by default — `Enter` and `q` cancel, No is the visually-safe default, the destructive Yes button is red; confirms name their target (`Remove container "web-1"?`) and prune confirms show live counts
- Prune actions report results (`Pruned — 1.2 GB reclaimed`); Copy Logs reports the copied line count; toast lifetimes tuned (info 2.5s, errors 6s)
- `z` cycles three layout modes (Normal → Wide → Expanded); Wide adapts to terminal width instead of starving the detail pane
- Log filter (`f`) works on any tailing logs tab including Services; pinning a compare target (`m`) jumps to the logs tab so the split view appears immediately
- Help overlay and status-bar hints are generated from the keybinding registry (`ink/keyRegistry.ts`), so they can no longer drift from the actual bindings
- Dependency refresh — TypeScript 5.9, React 19.2, esbuild 0.28, node-pty 1.1; `npm audit` reports 0 known vulnerabilities

#### VSCode

- One feedback voice for all Docker actions — progress notifications for slow operations, success toasts naming the item, error toasts with the real message; uniform across tree, quick picks, and dashboard
- Confirmation dialogs name their target, destructive/batch confirms are styled red, and `Enter` activates the focused button (Cancel by default)
- All commands categorized under "Sidekick Docker"; tree-only commands hidden from the palette
- Clicking a container in the tree no longer force-opens the dashboard (an inline icon does); tree items keep stable identities so collapse state survives refreshes
- Keyboard-opened actions menu (`x`) anchors at the selected row instead of screen center

### Fixed

#### CLI

- Actions-menu confirmations — choosing a destructive action from the `x`/right-click menu now shows the confirm modal; previously the menu close clobbered it and the action silently did nothing
- Dashboard compose actions (up/down/restart/stop) run against the `--socket` daemon via `DOCKER_HOST` instead of always the local default context
- Compare mode can reach the newest log lines — the column-header row was double-budgeted against the viewport, permanently hiding the last two lines
- Clicks and right-clicks on the `▼` indicator row or blank rows below the side list no longer select or act on off-screen items
- `q` can finally be typed into the filter and log-filter inputs (`rabbitmq`, `sqlite`, …); `Ctrl+C` always quits, even with an overlay open
- Dual-stack port bindings no longer listed twice (`18080:80/tcp, 18080:80/tcp` collapses to one entry) in `ps` and the TUI
- `--tail` is validated up front; `ps --format json | head` exits 0 on a closed pipe instead of printing a stack trace
- Side-list click off-by-one (the panel title row was a live click target); status bar no longer wraps on 60–80-column terminals; `▲`/`▼` indicator rows are budgeted inside bordered panes
- `x` no longer opens an empty actions menu for items with no applicable actions

#### VSCode

- Global shortcuts no longer fire while an input has focus — typing in the log filter previously switched panels on digits and could start/stop/remove containers on letter keys
- Compose actions run in the compose project's own directory (resolved from the working dir and config files Docker recorded for the project), falling back to the workspace folder — instead of whatever directory the extension host started in
- Daemon-down state is reported correctly at startup and mid-session — the tree shows the retry welcome instead of "No containers found" with a healthy status bar
- Rapid Retry clicks or live settings changes can no longer leak a duplicate Docker connection (orphaned event stream + refresh timer) or crash the dashboard initialization — init is now single-flight
- `F5`/refresh retries the connection when the dashboard is disconnected instead of silently doing nothing
- No more red `disconnected` flash on first paint and no misleading "No containers" empty state while the first connection attempt is in flight
- Log filter text containing double quotes no longer breaks the filter input (attribute escaping applied to all HTML attribute interpolations)

#### Shared

- An explicit `socketPath` pins the endpoint even when `DOCKER_HOST` is set — docker-modem silently preferred the environment host, so `--socket /path` and the VSCode `socketPath` setting targeted the wrong daemon
- An explicit `http://` endpoint on port 2376 stays plain HTTP (TLS is only inferred for the scheme-ambiguous `tcp://` form)
- `formatPorts()` deduplicates mappings Docker reports once per bind address (IPv4 + IPv6)
- Non-follow log fetches from non-TTY containers demultiplex Docker's frame format (no leaked headers, correct stderr tagging); TTY output with CRLF line endings parses timestamps and strips trailing carriage returns

## [0.2.6] - 2026-03-29

### Fixed

#### CLI

- Fix persistent heap OOM crash when running in slow terminals (e.g. VSCode integrated terminal) — stdout backpressure from Ink renders now skips frames when the write buffer exceeds the high-water mark instead of accumulating indefinitely
- Debounce event-driven refreshes in `DockerState` (500ms) — health_status, start, create, and other rapid Docker events no longer each trigger their own overlapping `refresh()` call
- Bound the compose log entries queue at 1000 — previously unbounded, the queue between the `docker compose logs` child process and the async generator could grow without limit

#### Shared

- Copy `Buffer` remainder instead of `subarray` view in `DockerClient.streamLogs()` — `subarray()` kept the entire parent buffer alive; now uses `Buffer.from()` to create an independent copy so the large combined buffer can be GC'd immediately

### Changed

#### CLI

- `SIDEKICK_DEBUG_STREAMS=1` diagnostics now include stdout buffer fill level (`writableLength`/`writableHighWaterMark`), external memory, and array buffer usage

## [0.2.5] - 2026-03-28

### Fixed

#### CLI

- Fix JavaScript heap out-of-memory crash after extended use (~2-3 hours) caused by multiple memory leaks
- Clean up `inspectedEnv`, `containerChanges`, and `imageLayers` caches on container destroy and periodic refresh — previously entries were never removed, leaking indefinitely
- Cap `LogTemplateEngine` at 500 template groups globally — previously unbounded, accumulating thousands of groups for containers with highly variable log patterns
- Prune `StatsCollector` history entries for non-running containers on periodic refresh
- Deterministic stream teardown using `AbortSignal` — switching containers or stopping streams now immediately destroys the underlying Docker HTTP connection instead of waiting for the next chunk
- Eliminate unnecessary shallow array copies in `getMetrics()` called every render cycle — return direct references since consumers never mutate
- Cache colorized log output with `WeakMap` — avoids re-tokenizing and re-colorizing all 1000 log lines every render, reducing per-render allocations from ~100K objects to near zero
- Eliminate `join('\n')` → `split('\n')` round-trip in log tab rendering — log tabs now return `string[]` directly

#### Shared

- Add `signal?: AbortSignal` parameter to `DockerClient.streamLogs()`, `DockerClient.streamStats()`, and `ComposeClient.streamLogs()` for immediate stream teardown
- Add `StatsCollector.prune()` method to remove history for non-active containers
- Add `LogTemplateEngine.getDiagnostics()` for group count, dropped groups, and total lines

### Changed

#### CLI

- Render throttle increased from 100ms to 200ms (10fps → 5fps) — still smooth for a TUI and halves GC pressure
- `DetailTab.render()` return type widened to `string | string[]` to avoid wasteful string conversions
- `BaseStreamManager` now uses `AbortController` per stream with a generation counter to prevent stale reconnects

### Added

#### CLI

- `SIDEKICK_DEBUG_STREAMS=1` environment variable enables periodic memory and template diagnostics (every 60s) for debugging long-running sessions

## [0.2.4] - 2026-03-26

### Fixed

#### CLI

- Fix crash on startup: `Cannot access 'renderTimer' before initialization` — `renderTimer` declaration was after its first usage via React effect mount chain (`onViewStateChange` → `flushLogsNow` → `scheduleRender`); moved declaration before stream manager callbacks

## [0.2.3] - 2026-03-26

### Added

#### Dual-Log Compare Mode

- Side-by-side log comparison — pin a second container or service to view both log streams simultaneously in left/right columns
- `m` key pins/unpins a compare target on Containers and Services panels (CLI)
- `Shift+J`/`Shift+K` scrolls the secondary (right) compare pane when in detail focus (CLI)
- Pin button on side list items in VS Code extension (hover-visible) to toggle compare mode
- Per-panel pin memory — each panel remembers its compare target independently when switching panels
- Auto-clear compare when the selected item matches the pinned item
- Log filter applies to both compare panes independently
- Severity count badges shown per-pane in compare mode

#### CLI

- New `CompareDetailPane` component rendering two fixed-width log columns with ANSI-safe clipping
- `clipAnsi()` utility for truncating ANSI-colored strings to a visible character width
- Shared `renderLogLines()` helper extracted from panel log rendering, used by both primary and secondary panes
- `m:Compare` contextual hint in status bar when on Logs tab

#### VS Code Extension

- Side-by-side CSS layout (`.log-compare-container`) with independently scrollable panes
- `toggleCompareItem` webview→extension message with Zod schema validation
- Secondary log and compose log stream lifecycle in `DockerService` (demand-driven, stops when not viewing Logs tab)

## [0.2.2] - 2026-03-24

### Fixed

- Copy logs (`c` key) now works on the Services panel — previously only worked on Containers panel (both CLI and VS Code)
- VS Code extension copy logs function now correctly reads compose logs when on the Services panel

## [0.2.1] - 2026-03-24

### Improved

- Debounced log rendering with 100ms flush window, reducing re-renders during high-throughput log output
- View-state-driven streaming — stats and log streams now activate based on which detail tab is visible and which sort field is active, instead of starting on every selection
- VS Code extension stops all background streams when the dashboard webview is hidden, restarting on focus
- Smart stream demand in VS Code: logs only stream on Containers panel, compose logs only on Services panel, stats only when the Stats tab is active or sorting by live metrics

### Fixed

- Add missing `zod` dependency to VS Code extension package for CI build

## [0.2.0] - 2026-03-14

### Added

#### Container Filesystem Inspector

- New **Files** detail tab on the Containers panel showing all filesystem changes made inside a container
- Color-coded change markers: green `A` for added, yellow `C` for changed, red `D` for deleted files
- Uses Docker's `container.changes()` API — works on both running and stopped containers
- One-shot fetch cached per container selection (same pattern as Env tab)
- Available in both TUI and VS Code extension

#### Image Layer Explorer

- New **Layers** detail tab on the Images panel showing the full layer history of an image
- Displays layer number, size, and the Dockerfile instruction that created it
- Strips `/bin/sh -c #(nop)` prefixes for cleaner instruction display
- Shows total image size and highlights the largest layer
- Uses Docker's `image.history()` API with Zod validation
- Available in both TUI and VS Code extension

#### Docker API Layer (`sidekick-docker-shared`)

- `DockerClient.getContainerChanges(id)` — returns typed `FilesystemChange[]` with Zod-validated response
- `DockerClient.getImageHistory(nameOrId)` — returns typed `ImageLayer[]` with Zod-validated response
- `FilesystemChange` type: `{ path: string; kind: 'added' | 'changed' | 'deleted' }`
- `ImageLayer` type: `{ id: string; created: Date; createdBy: string; size: number; comment: string }`
- Zod schemas: `ContainerChangeRawSchema`, `ContainerChangesResponseSchema`, `ImageHistoryItemRawSchema`, `ImageHistoryResponseSchema`

#### VS Code Extension

- Network I/O rate sparklines (RX/TX bytes/sec) in Stats tab
- Block I/O rate sparklines (read/write bytes/sec) in Stats tab
- Log severity sparkline in Stats tab

### Improved

#### Code Quality & Architecture

- Comprehensive Zod runtime validation for all Docker API responses (stats, events, container state, ports, volumes, networks, images, prune responses, container inspect, container changes, image history)
- Zod validation for webview→extension messages
- Modular shared package with enforced import DAG (`scripts/check-imports.mjs`) and 12 integration tests
- Sub-path exports (`sidekick-docker-shared/log`, `sidekick-docker-shared/formatters`) eliminating code forks in VSCode package
- Deduplicated formatters, branding, and phrases across CLI and VSCode
- Barrel `index.ts` files for compose, docker, and stats sub-modules
- `BaseStreamManager` extracted from three identical stream manager implementations
- Additional TypeScript strictness options enabled (`noFallthroughCasesInSwitch`, `noImplicitReturns`)

#### TUI Dashboard UX

- Async action feedback with in-progress toast while actions execute
- Contextual status bar hints showing available actions for the selected item
- Tiered confirmation modals (standard vs high-severity with warning styling)
- Tab scroll position persistence when cycling between detail tabs

## [0.1.5] - 2026-03-08

### Added

#### TUI Dashboard

- Pause (`p`) and Unpause (`u`) container actions
- Show all / running-only toggle (`a` key)
- Health status badge in container list and Config detail tab
- Network I/O rate sparklines (RX/TX bytes/sec) in Stats tab
- Block I/O stats with rate sparklines in Stats tab
- Container sorting by 7 fields (`o` key opens sort overlay) — state, name, CPU%, memory%, network I/O, block I/O, PIDs
- Reverse sort toggle (`R` key)

#### VS Code Extension

- Pause and Unpause container actions
- Health status display in Config detail tab
- Block I/O stats row in Stats detail tab

#### Docker API Layer (`sidekick-docker-shared`)

- `pauseContainer()` and `unpauseContainer()` methods on DockerClient
- Health status parsing from Docker status string (`healthy`, `unhealthy`, `starting`)
- Block I/O stats extraction (`blockRead`, `blockWrite` on `ContainerStats`)
- Network and block I/O rate series on `StatsCollector`

## [0.1.4] - 2026-03-07

### Added

#### TUI Dashboard

- 3-state layout cycle (`z` key): Normal → Wide → Expanded → Normal. Wide mode uses a 42-column side panel so full container/resource names are visible without truncation
- Copy logs to clipboard (`c` key on Containers panel) — copies buffered log text to system clipboard, respects active log filter. Uses platform-native clipboard (pbcopy, xclip, xsel, wl-copy)

#### VS Code Extension

- Tooltip on hover for side list items — shows full untruncated name for containers, images, volumes, networks, and services via HTML `title` attribute
- Copy logs to clipboard (`c` key or Copy button in log filter bar) — copies buffered log text to clipboard via `vscode.env.clipboard`, respects active log filter

### Changed

- Side panel truncation limits increased across all CLI panels to accommodate Wide layout mode (SideList already clips to available width in Normal mode)

## [0.1.3] - 2026-03-03

### Improved

#### Code Quality & Reliability

- Extract `ReconnectScheduler` utility replacing three identical reconnect implementations across stream managers
- Add `errorMessage()` helper eliminating 10 repeated `instanceof` checks
- Consolidate `MAX_LOG_LINES` constant to shared package
- Extract `withDockerClient` helper in VSCode extension removing five identical command handler bodies
- Extract `useKeyboardHandler` and `useMouseHandler` hooks from Dashboard.tsx (887 → ~370 lines)
- Extract shared types to reduce duplication across dashboard panels
- Replace silent `.catch(() => {})` with descriptive debug logging across all packages
- Wire AbortController signal through EventWatcher → DockerClient.streamEvents for proper stream teardown
- Add 24 new tests: DockerState (13), LogStreamManager (6), StatsStreamManager (5)

#### Security & Error Handling

- Replace `Math.random()` with `crypto.randomBytes()` for CSP nonce generation
- Fix redundant ternary that always evaluated to `'running'` in DockerState
- Extract magic numbers to named constants (toast durations, log buffer limits, reserved UI rows, reconnect delays)
- Add error logging to all stream manager catch blocks (previously silent)
- Add bounded retries with exponential backoff to Log/StatsStreamManager
- Add auto-reconnect to ComposeLogStreamManager (previously missing)
- Eliminate non-null assertions in ServicesPanel via discriminated union type
- Fix DockerClient resource leaks in VSCode extension commands (try/finally)
- Fix DockerService leak on failed initialize in DockerDashboardProvider
- Fix ComposeLogStreamManager missing exponential backoff (was retrying forever at fixed 2s)
- Make EventWatcher sleep cancellable on stop()

#### TUI Dashboard UX

- SideList: preserve icon color in focused selection (no longer lost to uniform cyan inverse)
- StatusBar: color-code destructive actions red, add focus indicator, condense navigation hints, visual separators between sections
- ContextMenuOverlay: add j/k/Enter/Esc keyboard hints, destructive actions shown in red, brand color border
- ConfirmOverlay: warning icon header, "cannot be undone" hint, colored button badges, "or Esc to cancel" hint
- FilterOverlay: brand-blue background with search icon, Enter/Esc help text
- LogFilterOverlay: use brand color instead of generic blue
- DetailTabBar: show tab label for single-tab panels, clarify hint to "[/] cycle tabs"
- TabBar: color-code container count badges (green=all running, yellow=partial)
- TooSmallOverlay: show exactly how much wider/taller the terminal needs to be, added branding
- ToastNotification: severity-specific icons, colored background instead of text-only, readable warning contrast
- HelpOverlay: keyboard keys rendered as colored badges, horizontal rule dividers, danger indicators on destructive actions
- VersionOverlay: horizontal rule dividers, brand-blue version text
- SideList empty states: styled no-match indicator, command hints with brand-blue highlight

#### VS Code Extension

- Inject version from package.json at build time instead of hardcoded value

### Fixed

- `bump-version.sh` now includes root `package.json`

## [0.1.2] - 2026-03-01

### Added

#### Log Analytics Engine (`sidekick-docker-shared`)

- Token-level log syntax highlighting — HTTP methods, status codes, URLs, IPs, timestamps, JSON keys, state keywords, and paths each get distinct colors (replaces whole-line severity coloring)
- Log content search and filtering with two modes: exact substring (case-insensitive) and fuzzy (AND-of-words), with match highlighting and match count display
- Severity counting — running tallies of ERROR, WARN, INFO, DEBUG, and OTHER per log stream, displayed as colored badges in the Logs tab header
- Structured log parsing — auto-detects JSON, logfmt, and plain text formats; extracts level, message, timestamp, and structured fields from JSON and logfmt logs
- Severity time-series — 60-bucket ring buffer tracking per-severity counts over time (1-minute buckets), rendered as a color-coded sparkline in the Stats tab
- Log pattern clustering — Drain-like algorithm groups similar log lines into templates with `<*>` wildcards, displayed in a new Patterns detail tab ranked by frequency

#### TUI Dashboard

- `f` key opens log filter overlay when viewing the Logs tab (exact/fuzzy mode toggle with `Tab`, `Esc` to clear)
- Severity counts header row in Logs tab (`E:n W:n I:n D:n`, each colored by severity)
- Log severity sparkline in Stats tab below CPU/Memory charts (colored by dominant severity per time bucket)
- New **Patterns** detail tab on Containers panel showing top log templates with frequency counts

#### VS Code Extension

- Log filter search bar with mode toggle and match count in Logs tab
- Severity count badges in Logs tab header
- New **Patterns** detail tab with template frequency ranking
- Token-level syntax highlighting CSS classes for all log token types

## [0.1.1] - 2026-02-28

### Added

#### VS Code Extension — Sidebar & Tree View

- Activity bar icon with dedicated "Sidekick Docker" view container
- Container tree view grouped by state (Running / Stopped / Other)
- Tree view badge showing running container count
- Inline Start/Stop buttons on container tree items (contextual per state)
- Refresh and Open Dashboard buttons in tree view title bar
- Welcome view with "Open Dashboard" button when no containers are present
- Status bar indicator (right-aligned) showing running/total container counts
- Status bar shows "Docker offline" warning when daemon is unreachable
- Click container in tree to open dashboard focused on that container

#### VS Code Extension — Quick Pick Commands

- `Sidekick Docker: Start Container...` — pick from stopped containers
- `Sidekick Docker: Stop Container...` — pick from running containers
- `Sidekick Docker: Restart Container...` — pick from running containers

#### VS Code Extension — Stats Sparklines

- CPU and memory sparkline charts (Unicode block characters) below progress bars
- History data from StatsCollector (60 samples) sent to webview

#### Compose Log Streaming

- `ComposeClient.streamLogs()` async generator for real-time compose log streaming
- CLI Services panel now shows live logs (replaces placeholder)
- VS Code Services panel Logs tab with real-time compose log streaming
- Selection-driven streaming: starts on select, stops on deselect

### Fixed

- Panel tab clicks not working in VS Code webview (mousedown handler was destroying DOM before click fired)
- Double-spaced log lines in VS Code webview (whitespace: pre + display: flex + newline join)

## [0.1.0] - 2026-02-28

### Added

#### Terminal Dashboard (TUI)

- Five-panel layout: Containers, Compose Services, Images, Volumes, Networks
- Vi keybindings: `j`/`k` navigation, `g`/`G` jump, `1`-`5` panel switch, `[`/`]` detail tab cycling
- Context menus with per-resource actions (start, stop, restart, remove, exec, up, down, prune)
- Filter/search with `/` across all resource lists
- Confirmation modals for all destructive actions (remove, prune)
- Help overlay (`?`) with full keybinding reference
- Mouse support: click to select, scroll to navigate
- Toast notifications for action feedback
- Expanded layout toggle (`z`) for detail pane focus

#### Real-Time Streaming

- Live log streaming with stdout/stderr coloring (1000-line ring buffer)
- Stats sparklines for CPU and memory usage (60-sample ring buffer)
- Docker event watching with auto-reconnect on connection loss

#### Compose Support

- Automatic project detection from container labels (`com.docker.compose.*`)
- Fallback detection via `docker compose config`
- Merged view showing running containers and planned services
- Per-project actions: up, down, restart, stop

#### Interactive Exec

- Drop into a running container shell via `node-pty`
- Supports bash, sh, and ash

#### CLI Commands

- `sidekick-docker ps` — list containers (non-interactive)
- `sidekick-docker logs <container>` — stream container logs
- `--socket <path>` flag for custom Docker socket
- `--version` flag

#### Docker API Layer (`sidekick-docker-shared`)

- `DockerClient` facade wrapping dockerode with typed methods
- `ComposeDetector` for label-based and file-based project discovery
- `ComposeClient` wrapping `docker compose` CLI commands
- `EventWatcher` with auto-reconnect and typed callbacks
- `StatsCollector` per-container ring buffer with CPU/memory time series
- Full type system: `ContainerInfo`, `ImageInfo`, `VolumeInfo`, `NetworkInfo`, `ComposeProject`, `DockerEvent`, and more
- Utility formatters: `formatBytes`, `formatCpu`, `stateIcon`, `stateColor`, `truncate`

#### VS Code Extension

- Webview-based Docker dashboard with the same panel layout as the TUI
- Typed message protocol for extension-to-webview communication
- Command palette integration: `Sidekick Docker: Open Dashboard`

#### Build System

- tsc for shared library (CommonJS + declarations)
- esbuild for CLI (single ESM binary) and VS Code (dual CJS + IIFE output)
- `bump-version.sh` script for synchronized version updates across all 3 packages

[0.4.0]: https://github.com/cesarandreslopez/sidekick-docker/releases/tag/v0.4.0
[0.3.0]: https://github.com/cesarandreslopez/sidekick-docker/releases/tag/v0.3.0
[0.2.6]: https://github.com/cesarandreslopez/sidekick-docker/releases/tag/v0.2.6
[0.2.5]: https://github.com/cesarandreslopez/sidekick-docker/releases/tag/v0.2.5
[0.2.4]: https://github.com/cesarandreslopez/sidekick-docker/releases/tag/v0.2.4
[0.2.3]: https://github.com/cesarandreslopez/sidekick-docker/releases/tag/v0.2.3
[0.2.2]: https://github.com/cesarandreslopez/sidekick-docker/releases/tag/v0.2.2
[0.2.1]: https://github.com/cesarandreslopez/sidekick-docker/releases/tag/v0.2.1
[0.2.0]: https://github.com/cesarandreslopez/sidekick-docker/releases/tag/v0.2.0
[0.1.5]: https://github.com/cesarandreslopez/sidekick-docker/releases/tag/v0.1.5
[0.1.4]: https://github.com/cesarandreslopez/sidekick-docker/releases/tag/v0.1.4
[0.1.3]: https://github.com/cesarandreslopez/sidekick-docker/releases/tag/v0.1.3
[0.1.2]: https://github.com/cesarandreslopez/sidekick-docker/releases/tag/v0.1.2
[0.1.1]: https://github.com/cesarandreslopez/sidekick-docker/releases/tag/v0.1.1
[0.1.0]: https://github.com/cesarandreslopez/sidekick-docker/releases/tag/v0.1.0
