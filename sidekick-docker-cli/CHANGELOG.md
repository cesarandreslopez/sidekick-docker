# Changelog

All notable changes to the Sidekick Docker CLI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
