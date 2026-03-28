# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
