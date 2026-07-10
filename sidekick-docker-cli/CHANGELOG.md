# Changelog

All notable changes to the Sidekick Docker CLI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-07-10

### Added

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
- `--help` includes usage examples and an environment section (`DOCKER_HOST`, `NO_COLOR`, `FORCE_COLOR`)

### Changed

- Confirm modals are safe by default — `Enter` and `q` cancel, No is the visually-safe default, the destructive Yes button is red; confirms name their target (`Remove container "web-1"?`) and prune confirms show live counts
- Prune actions report results (`Pruned — 1.2 GB reclaimed`); Copy Logs reports the copied line count; toast lifetimes tuned (info 2.5s, errors 6s)
- `z` cycles three layout modes (Normal → Wide → Expanded); Wide adapts to terminal width instead of starving the detail pane
- Log filter (`f`) works on any tailing logs tab including Services; pinning a compare target (`m`) jumps to the logs tab so the split view appears immediately
- Help overlay and status-bar hints are generated from the keybinding registry (`ink/keyRegistry.ts`), so they can no longer drift from the actual bindings
- Dependency refresh — TypeScript 5.9, React 19.2, esbuild 0.28, node-pty 1.1; `npm audit` reports 0 known vulnerabilities

### Fixed

- Actions-menu confirmations — choosing a destructive action from the `x`/right-click menu now shows the confirm modal; previously the menu close clobbered it and the action silently did nothing
- Dashboard compose actions (up/down/restart/stop) run against the `--socket` daemon via `DOCKER_HOST` instead of always the local default context
- An explicit `--socket` socket path pins the endpoint even when `DOCKER_HOST` is set in the environment (the env host silently won before)
- Compare mode can reach the newest log lines — the column-header row was double-budgeted against the viewport, permanently hiding the last two lines
- Clicks and right-clicks on the `▼` indicator row or blank rows below the side list no longer select or act on off-screen items
- `q` can finally be typed into the filter and log-filter inputs (`rabbitmq`, `sqlite`, …); `Ctrl+C` always quits, even with an overlay open
- Dual-stack port bindings no longer listed twice (`18080:80/tcp, 18080:80/tcp` collapses to one entry) in `ps` and the TUI
- `--tail` is validated up front; `ps --format json | head` exits 0 on a closed pipe instead of printing a stack trace
- TTY container logs with `--no-follow` parse timestamps and no longer leak trailing carriage returns into piped output
- Side-list click off-by-one (the panel title row was a live click target); status bar no longer wraps on 60–80-column terminals; `▲`/`▼` indicator rows are budgeted inside bordered panes
- `x` no longer opens an empty actions menu for items with no applicable actions

## [0.2.6] - 2026-03-29

### Fixed

- Fix persistent heap OOM crash when running in slow terminals (e.g. VSCode integrated terminal) — stdout backpressure from Ink renders now skips frames when the write buffer exceeds the high-water mark
- Debounce event-driven refreshes in `DockerState` (500ms) — rapid Docker events (health_status, start, create) no longer trigger overlapping `refresh()` calls
- Bound the compose log entries queue at 1000 (previously unbounded)

### Changed

- `SIDEKICK_DEBUG_STREAMS=1` diagnostics now include stdout buffer fill, external memory, and array buffer usage

## [0.2.5] - 2026-03-28

### Fixed

- Fix JavaScript heap out-of-memory crash after extended use (~2-3 hours) caused by multiple memory leaks:
  - Clean up `inspectedEnv`, `containerChanges`, and `imageLayers` caches on container destroy and periodic refresh
  - Cap `LogTemplateEngine` at 500 template groups globally (was unbounded)
  - Prune `StatsCollector` history entries for non-running containers on periodic refresh
  - Deterministic stream teardown using `AbortSignal` — switching containers now immediately destroys underlying Docker connections
  - Eliminate unnecessary shallow array copies in `getMetrics()` (9 arrays copied every 100ms render)
  - Cache colorized log output with `WeakMap` to avoid re-tokenizing all 1000 log lines per render
  - Eliminate `join('\n')` → `split('\n')` round-trip in log tab rendering

### Changed

- Render throttle increased from 100ms to 200ms — still smooth for TUI, halves GC pressure
- `DetailTab.render()` return type widened to `string | string[]`
- `BaseStreamManager` refactored to use `AbortController` per stream with generation counter

### Added

- `SIDEKICK_DEBUG_STREAMS=1` environment variable enables periodic memory and template diagnostics (every 60s)

## [0.2.4] - 2026-03-26

### Fixed

- Fix crash on startup: `Cannot access 'renderTimer' before initialization` — moved `renderTimer` declaration and `scheduleRender` function before stream manager callbacks that reference them

## [0.2.3] - 2026-03-26

### Added

- **Dual-log compare mode** — pin a second container or service with `m` to view both log streams side by side in left/right columns
- `Shift+J`/`Shift+K` scrolls the secondary (right) compare pane when in detail focus
- Per-panel pin memory — each panel remembers its compare target independently
- Auto-clear compare when the selected item matches the pinned item
- Pin indicator (`📌`) in side list for the compare target
- `m:Compare` contextual hint in status bar when on Logs tab
- New `CompareDetailPane` component with ANSI-safe column clipping
- `clipAnsi()` utility for truncating ANSI-colored strings at visible character boundaries
- Shared `renderLogLines()` helper extracted from panel log rendering

## [0.2.2] - 2026-03-24

### Fixed

- Copy logs (`c` key) now works on the Services panel — previously only worked on Containers panel

## [0.2.1] - 2026-03-24

### Improved

- Debounced log rendering with 100ms flush window, reducing re-renders during high-throughput log output
- View-state-driven streaming — stats and log streams activate based on visible detail tab and active sort field

## [0.2.0] - 2026-03-14

### Added

- New **Files** detail tab on Containers panel — shows all filesystem changes inside a container with color-coded markers (A=added, C=changed, D=deleted). Works on running and stopped containers
- New **Layers** detail tab on Images panel — shows full image layer history with layer number, size, and Dockerfile instruction. Highlights the largest layer
- Async action feedback — toast shows in-progress state while container actions execute
- Contextual status bar hints — shows available action keys for the currently selected item
- Tiered confirmation modals with high-severity warning styling for destructive actions
- Tab scroll position persistence when cycling between detail tabs

### Improved

- `BaseStreamManager` extracted, deduplicating three stream manager implementations
- Additional TypeScript strictness options enabled

## [0.1.5] - 2026-03-08

### Added

- Pause (`p`) and Unpause (`u`) container actions
- Show all / running-only toggle (`a` key) — filters container list
- Health status badge in container list items and Config detail tab
- Network I/O rate sparklines (RX/TX bytes/sec) in Stats tab
- Block I/O stats with rate sparklines in Stats tab
- Container sorting (`o` key) — sort by state, name, CPU%, memory%, network I/O, block I/O, PIDs
- Reverse sort toggle (`R` key)

## [0.1.4] - 2026-03-07

### Added

- 3-state layout cycle (`z` key): Normal → Wide (42-col side panel) → Expanded (side panel hidden). Previously was a 2-state toggle between Normal and Expanded
- Copy logs to clipboard (`c` key on Containers panel) — copies buffered log text to system clipboard, respects active log filter. Supports macOS (pbcopy) and Linux (xclip, xsel, wl-copy)

### Changed

- Side panel truncation limits increased across all panels to show full names in Wide mode (SideList already clips to available width in Normal mode)
- Help overlay updated to reflect 3-state layout cycle
- TabBar layout indicator now shows Normal/Wide/Expanded

## [0.1.3] - 2026-03-03

### Improved

- Extract `useKeyboardHandler` and `useMouseHandler` hooks from Dashboard.tsx (887 → ~370 lines)
- Extract shared types to reduce duplication across dashboard panels
- Replace silent `.catch(() => {})` with descriptive debug logging
- Add bounded retries with exponential backoff to Log/StatsStreamManager
- Add auto-reconnect to ComposeLogStreamManager (previously missing)
- Fix ComposeLogStreamManager missing exponential backoff (was retrying forever at fixed 2s)
- Add error logging to all stream manager catch blocks (previously silent)
- Fix redundant ternary that always evaluated to `'running'` in DockerState
- Extract magic numbers to named constants (toast durations, log buffer limits, reserved UI rows, reconnect delays)
- Eliminate non-null assertions in ServicesPanel via discriminated union type
- Add 24 new tests: DockerState (13), LogStreamManager (6), StatsStreamManager (5)

#### Dashboard UX

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

## [0.1.2] - 2026-03-01

### Added

- `f` key opens log filter overlay when viewing the Logs tab (exact/fuzzy mode toggle with `Tab`, `Esc` to clear)
- Severity counts header row in Logs tab (`E:n W:n I:n D:n`, each colored by severity)
- Log severity sparkline in Stats tab below CPU/Memory charts (colored by dominant severity per time bucket)
- New **Patterns** detail tab on Containers panel showing top log templates with frequency counts

## [0.1.1] - 2026-02-28

### Added

- Live compose log streaming in Services panel Logs tab (replaces placeholder)
- Selection-driven compose log management via `ComposeLogStreamManager`

## [0.1.0] - 2026-02-28

### Added

- Five-panel dashboard: Containers, Compose Services, Images, Volumes, Networks
- Vi keybindings: `j`/`k` navigation, `g`/`G` jump, `1`-`5` panel switch, `[`/`]` detail tab cycling
- Context menus with per-resource actions (start, stop, restart, remove, exec, up, down, prune)
- Filter/search with `/` across all resource lists
- Confirmation modals for all destructive actions (remove, prune)
- Help overlay (`?`) with full keybinding reference
- Mouse support: click to select, scroll to navigate
- Toast notifications for action feedback
- Expanded layout toggle (`z`) for detail pane focus
- Live log streaming with stdout/stderr coloring (1000-line ring buffer)
- Stats sparklines for CPU and memory usage (60-sample ring buffer)
- Docker event watching with auto-reconnect on connection loss
- Compose project detection from container labels and `docker compose config`
- Interactive exec into running containers via `node-pty`
- `sidekick-docker ps` — list containers (non-interactive)
- `sidekick-docker logs <container>` — stream container logs
- `--socket <path>` flag for custom Docker socket

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
