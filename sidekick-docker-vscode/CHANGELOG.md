# Changelog

All notable changes to the Sidekick Docker VS Code extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.0] - 2026-11-15

### Fixed

- Log lines keep the spaces between highlighted words.
- On a busy container you can read older log lines without the text drifting away. Compare panes follow new output and scroll from the keyboard, and the log toolbar stays on screen.
- "Open in Dashboard" from the tree no longer selects the wrong container when the dashboard was in the background.
- F5 refreshes the dashboard without also starting the debugger, and still continues a paused debug session.
- At narrow widths, status-bar buttons and the panel and detail tabs are no longer clipped, and the filter bar no longer covers the list. Help, sort and version overlays have a solid, scrollable body.
- Keyboard focus survives re-renders and returns to whatever opened a menu or overlay. Confirmation dialogs announce their message to screen readers, and the disconnected banner blocks the UI behind it.
- Identical error toasts no longer pile up. Loading states offer Retry instead of waiting forever, the Files tab re-reads changes and shows when it read them, and Copy Logs on Services no longer applies a hidden filter.
- Compose actions are not offered in an untrusted workspace, and Up/Down toasts name the project.
- Removing an image with several tags no longer fails with "must be forced", and an image a container still uses is refused before any tag is touched. Untagged images are recognised on Docker Engine 24+ and listed as `<none> (id)`.
- Volume prune counts and names only the anonymous volumes Engine 23+ actually removes.
- Tree:
  - Start is not offered on dead containers, Stop shows for paused and restarting ones, and Remove is offered for running ones.
  - Group headers no longer get container menus ("Open in Dashboard" on one failed).
  - Retry and a lost daemon keep the explanation instead of showing a raw error, and the tree no longer flashes "No containers found" while connecting.
  - Compose group tooltips match the actions offered, and projects with only paused or restarting containers can be taken down.
  - Clicking a row keeps focus in the tree.
- An invalid `sidekick-docker.socketPath` warns once and is not shown as the endpoint, and the "socket not found" hint names that setting instead of the CLI's `--socket`.
- "Open Dashboard to the Side" moves an already open dashboard.

### Added

- The Services logs have a filter. The dashboard also shows network labels and image layer comments, indents services under their project, and supports `l`/`→`; the help lists every key.

### Changed

- Confirmation, failure and prune-result wording is shared with the terminal dashboard and the tree (for example "Failed to stop web: …").
- "Running only" (`a`) keeps running, paused and restarting containers.
- The list shows full names, shortened by the layout and keeping the replica number or image tag.

## [0.5.0] - 2026-10-18

### Fixed

- Log streams of stopped containers and Compose projects end instead of reconnecting every 2 seconds and appending the same tail (Compose spawned a new `docker compose logs` each time); reconnects resume from the last timestamp, and streams return when the target starts.
- The dashboard and tree keep updating on hosts with healthchecks: refreshes always commit, healthcheck events are ignored, and event-driven refreshes are debounced instead of running immediately for every event.
- Docker reads, refresh passes and `docker compose` commands have deadlines, so a hung call cannot freeze the dashboard.
- A dashboard recreated behind a hidden panel (for example after a settings change) no longer keeps polling.
- An untrusted workspace can no longer redirect the extension to another Docker endpoint or exec shell: `sidekick-docker.socketPath` and `sidekick-docker.exec.defaultShell` are restricted settings, and trusting the folder reconnects with its settings.
- Start is no longer offered for paused containers; Stop is offered for paused and restarting ones.
- Name sort compares full names, and sort toasts name the correct direction.
- `docker compose config` honours `socketPath`.

### Added

- Compose Up, Restart and Down on Compose project groups in the container tree (Down asks for confirmation; unavailable in untrusted workspaces).
- Open a running container's published port in the browser (`b` in the dashboard), through VS Code's port forwarding when remote.
- Config tab: health check failing streak and last output, exit code with OOM or daemon error, restart policy and count, and mounts.
- The connection banner, toast and tree explain why Docker is unreachable; the tree shows "Connecting to Docker…" during the first connect; the status bar counts unhealthy containers and shows the endpoint in its tooltip.
- Accessibility: list rows announce state, health and pin; tabs use arrow-key navigation; the actions menu is focusable; high-contrast themes outline selections.

### Changed

- Prune confirmations show how many items they remove, removing a running container warns that it is stopped first, and the status bar reads "3/5 running" and shows the sort direction in words.

## [0.4.1] - 2026-09-06

### Fixed

- Preserve fragmented Docker JSON and UTF-8 log data, including live TTY output and final Compose log lines.
- Abort obsolete streams on selection changes, hidden dashboards, and disposal; stop retrying empty streams after the reconnect budget is exhausted.
- Keep visible selection, details, and action targets aligned after filtering or refresh, and preserve the detail tab when selecting another item.
- Preserve modified editor shortcuts and native Tab/Shift+Tab traversal; support sort clicks and keep modal focus contained during updates.
- Refresh pinned comparisons when only the secondary source produces logs, and restore comparison pins when switching panels.
- Update Patterns as selected logs arrive without losing focus or scroll position.
- Preserve Compose override order, report missing project files, and display running/total replicas for scaled services.
- Restore SSH in the packaged extension by bundling the SSH transport with JavaScript fallbacks for optional native accelerators.
- Coalesce refreshes, retain successful resource data on partial failures, and prevent pending watcher or detail work from publishing after disposal.

### Added

- Detail-load and stream status messages with Retry controls, plus partial refresh warnings.
- DOM regression tests and SSH smoke checks against the production VSIX.

## [0.4.0] - 2026-07-24

### Added

- `Sidekick Docker: Exec into Container...` and `Sidekick Docker: Show Container Logs...` — reachable from the container tree and the command palette. Exec was previously reachable only from inside the webview, despite a documented `sidekick-docker.exec.defaultShell` setting that most users had no way to exercise
- Clicking a tree item opens it; unhealthy and starting containers are now visually distinct in the tree
- Container prune; images, volumes and networks already had it
- Labels tab for containers, and network addressing (subnet, gateway, IPAM, per-container IPs) in the Networks Info tab
- Volume Info lists the containers mounting each volume

### Fixed

- **Sorting containers by CPU, memory, network, block I/O or PIDs compared zeros.** Stats are streamed one container at a time by design, so nothing held a sample for any unselected row. A one-shot sampler now fills every other running container while a stats sort is active
- **Log and stats streams never recovered.** A container restart ended them permanently while the pane still looked live
- **Failed operations reported success.** `docker compose` exit codes and stderr were discarded at every call site, so a failed `up` still rendered the success toast; prune results were discarded, so reclaimed space could not be reported
- **Networks never listed their containers.** Docker's `GET /networks` omits the container map, so every network reported zero attachments — which also meant the "cannot remove a network in use" guard never fired. Attachments are now derived from the container listing
- **The `socketPath` setting was ignored by spawned `docker` processes.** Compose and exec inherited the ambient environment, so they could target a different daemon than the one on screen
- Detail tabs could sit on "Loading…" forever — Env, Files and Layers swallowed fetch errors and now show what failed

### Changed

- Declares `extensionKind: workspace`, so Remote-SSH and dev-container sessions target the remote daemon rather than the local one
- Runs in an untrusted workspace with `capabilities.untrustedWorkspaces: "limited"` — containers, images, volumes and networks behave normally, while compose is disabled, because `docker compose config`/`up` reads and executes a compose file the workspace itself controls. Previously the extension was disabled outright in Restricted Mode
- Ships a minified bundle — a `vscode:prepublish` hook was missing, so published builds carried unminified sources and sourcemaps
- `@types/vscode` is pinned to match `engines.vscode`, which it previously floated 24 minor versions above
- Accessibility: the webview list now takes focus so screen readers announce selection, decorative glyphs are hidden from assistive tech, mouse-only affordances became real buttons, and modal overlays manage focus
- The dashboard works outside a dark theme — hardcoded status colours became theme variables

## [0.3.0] - 2026-07-10

### Added

- **Extension settings** — `sidekick-docker.socketPath` (socket path, `unix://`, or `tcp://host:port`; `DOCKER_HOST` is used when empty), `sidekick-docker.refreshIntervalSeconds` (min 5s), `sidekick-docker.statusBar.visible`, and `sidekick-docker.exec.defaultShell` (was hardcoded `/bin/sh`); socket/refresh changes apply live without a reload, and an invalid `socketPath` warns instead of silently connecting to the default socket
- Dashboard survives window reloads — active panel, selection, detail tab, sort, layout mode, and the all/running filter are restored (stale saved state is validated and clamped)
- `Sidekick Docker: Open Dashboard to the Side` command — opens the dashboard in a split editor column
- Default keybindings — `Ctrl+Alt+D` opens the dashboard (all platforms; macOS reserves `Cmd+Opt+D` for Dock hiding), `Ctrl/Cmd+Alt+R` refreshes containers while the tree has focus
- Tree view context menus per container state — Restart, Pause, Unpause, and Remove (paused and restarting containers previously had no actions); Remove asks with a modal naming the container
- Compose project sub-groups in the container tree, with container counts
- Tree welcome states — "Docker daemon is not reachable" with a Retry Connection button when the daemon is down, and a real "No containers found" view
- Mouse action path in the dashboard — right-click a row or click its `⋯` button to open the actions menu anchored at the pointer; clickable status-bar hint chips (`/ filter`, `x actions`, `? help`, `↻ refresh`); overlays close on outside click
- Keyboard parity with the TUI — `m` pins/unpins the compare pane, `f` focuses the log filter, `Shift+J`/`Shift+K` scroll the compare pane, `F5` refreshes, `PgUp`/`PgDn` full-page and `Ctrl+D`/`Ctrl+U` half-page scrolling
- Connection-aware dashboard — skeleton rows and a pulsing `connecting…` dot while connecting; a persistent banner with a Retry button when the daemon is down
- Health badges on container rows in the side list (`✓` healthy, `✗` unhealthy, `◌` starting), with health in the hover tooltip
- Sticky error toasts — errors stay until dismissed and gain Copy and dismiss buttons (previously vanished after 4 seconds)
- Accessibility — ARIA roles and selection states for tabs, lists, menus, and dialogs; `aria-live` toasts and connection status; visible focus outlines; `Enter`/`Space` activates a focused tab; `prefers-reduced-motion` disables pulse/skeleton animations; stat bars add a `high` text band so color is not the only overload signal

### Changed

- One feedback voice for all Docker actions — slow operations run inside progress notifications that survive switching tabs; success toasts name the item ("Stopped web-1"); error toasts include the item name and the real error message; uniform across the tree view, quick picks, and the dashboard
- Confirmation dialogs name their target ("Remove container \"web-1\"?"), destructive and batch (prune) confirms are styled red, and `Enter` activates the focused button — Cancel by default
- All commands are categorized under "Sidekick Docker"; tree-only container commands are hidden from the palette (invoking them there silently did nothing)
- Clicking a container in the tree no longer force-opens the dashboard — an inline icon opens it instead; tree items have stable identities so collapse state survives refreshes
- Services panel shows a real empty state instead of a fake "No compose projects found" row
- Keyboard-opened actions menu (`x`) anchors at the selected row instead of screen center; info toast lifetime aligned with the TUI (2.5s)

### Fixed

- Global shortcuts no longer fire while an input has focus — typing in the log filter previously switched panels on digits and could start/stop/remove containers or open an exec terminal on letter keys; `Escape` blurs and `Enter` commits
- Compose actions (up/down/restart/stop) run in the compose project's own directory — resolved from the working dir and compose files Docker recorded for the project, falling back to the workspace folder — instead of whatever directory the extension host started in; compose file detection likewise scans workspace folders
- Daemon-down state is reported correctly at startup and mid-session — the tree shows the retry welcome instead of "No containers found" with a healthy status bar count
- Rapid Retry clicks or live settings changes can no longer leak a duplicate Docker connection (orphaned event stream and refresh timer) or crash the dashboard initialization — init is single-flight, and closing the panel mid-init disposes the in-flight connection
- `F5`/refresh retries the connection when the dashboard is disconnected instead of silently doing nothing
- No more red `disconnected` flash on first paint and no misleading "No containers" empty state while the first connection attempt is in flight
- Log filter text containing double quotes no longer breaks the filter input — attribute escaping applied to all HTML attribute interpolations
- Info-toned UI (log severities, JSON keys, detail labels, sparklines) uses one theme-derived `--sd-info` color instead of inconsistent low-contrast fallbacks

## [0.2.6] - 2026-03-29

_No changes — CLI/shared memory fix release._

## [0.2.5] - 2026-03-28

_No changes — CLI memory leak fix release. Shared package updated with `AbortSignal` support for stream methods and `StatsCollector.prune()`._

## [0.2.4] - 2026-03-26

_No changes — CLI-only bugfix release._

## [0.2.3] - 2026-03-26

### Added

- **Dual-log compare mode** — pin a second container or service to view both log streams side by side in left/right columns
- Pin button (hover-visible `📌`) on side list items to toggle compare mode
- Side-by-side CSS layout with independently scrollable panes
- Per-panel pin memory — each panel remembers its compare target independently
- Auto-clear compare when the selected item matches the pinned item
- `toggleCompareItem` webview→extension message with Zod schema validation
- Secondary log and compose log stream lifecycle in `DockerService` (demand-driven)

## [0.2.2] - 2026-03-24

### Fixed

- Copy logs (`c` key) now works on the Services panel — previously only worked on Containers panel
- Copy logs function now correctly reads compose logs instead of container logs when on the Services panel

## [0.2.1] - 2026-03-24

### Improved

- View-state-driven streaming — streams activate based on visible panel, detail tab, and sort field instead of starting on every selection
- Dashboard stops all background streams when webview is hidden, restarting on focus
- Smart stream demand: logs only on Containers panel, compose logs only on Services panel, stats only when Stats tab is active or sorting by live metrics

### Fixed

- Add missing `zod` dependency for CI build

## [0.2.0] - 2026-03-14

### Added

- New **Files** detail tab on Containers panel — shows all filesystem changes inside a container with color-coded markers (A=added, C=changed, D=deleted). Works on running and stopped containers
- New **Layers** detail tab on Images panel — shows full image layer history with layer number, size, and Dockerfile instruction. Highlights the largest layer
- Network I/O rate sparklines (RX/TX bytes/sec) in Stats tab
- Block I/O rate sparklines (read/write bytes/sec) in Stats tab
- Log severity sparkline in Stats tab (colored by dominant severity per time bucket)

## [0.1.5] - 2026-03-08

### Added

- Pause (`p`) and Unpause (`u`) container actions in context menu
- Health status display in Config detail tab — shows colored health indicator (green=healthy, red=unhealthy, yellow=starting) when container has a health check configured
- Block I/O stats row in Stats detail tab — shows cumulative read/write bytes alongside existing network I/O

## [0.1.4] - 2026-03-07

### Added

- Tooltip on hover for all side list items — shows full untruncated resource name (containers, images, volumes, networks, services) via native HTML `title` attribute
- Copy logs to clipboard (`c` key or Copy button in log filter bar) — copies buffered log text to clipboard via `vscode.env.clipboard`, respects active log filter and mode

## [0.1.3] - 2026-03-03

### Improved

- Extract `withDockerClient` helper removing five identical command handler bodies
- Fix DockerClient resource leaks in extension commands (try/finally)
- Fix DockerService leak on failed initialize in DockerDashboardProvider
- Replace `Math.random()` with `crypto.randomBytes()` for CSP nonce generation

### Fixed

- Status bar version now injected from package.json at build time (was hardcoded at v0.1.0)

## [0.1.2] - 2026-03-01

### Added

- Token-level log syntax highlighting — HTTP methods, status codes, URLs, IPs, timestamps, JSON keys, state keywords, and paths each get distinct colors
- Log content search and filtering with exact substring and fuzzy modes, with match highlighting and match count
- Severity count badges in Logs tab header (ERROR, WARN, INFO, DEBUG counts)
- New **Patterns** detail tab showing log templates grouped by similarity with `<*>` wildcards and frequency counts
- Structured log format detection (JSON, logfmt, plain text)

## [0.1.1] - 2026-02-28

### Added

- Activity bar icon with dedicated "Sidekick Docker" view container
- Container tree view grouped by state (Running / Stopped / Other)
- Tree view badge showing running container count
- Inline Start/Stop buttons on container tree items (contextual per state)
- Refresh and Open Dashboard buttons in tree view title bar
- Welcome view with "Open Dashboard" button when no containers are present
- Status bar indicator (right-aligned) showing running/total container counts
- Status bar shows "Docker offline" warning when daemon is unreachable
- Click container in tree to open dashboard focused on that container
- Quick pick commands: Start, Stop, and Restart containers from the command palette
- CPU and memory sparkline charts (Unicode block characters) in Stats tab
- Compose log streaming in Services panel Logs tab

### Fixed

- Panel tab clicks not working (mousedown handler was destroying DOM before click fired)
- Double-spaced log lines (whitespace: pre + display: flex + newline join conflict)

## [0.1.0] - 2026-02-28

### Added

- Webview-based Docker dashboard with five-panel layout (Containers, Services, Images, Volumes, Networks)
- Typed message protocol for extension-to-webview communication
- Command palette integration: `Sidekick Docker: Open Dashboard`
- Live container log streaming with stdout/stderr coloring
- Container stats with CPU and memory progress bars
- Environment variable inspector
- Container config detail view
- Docker event watching for real-time state updates

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

[0.6.0]: https://github.com/cesarandreslopez/sidekick-docker/releases/tag/v0.6.0
[0.5.0]: https://github.com/cesarandreslopez/sidekick-docker/releases/tag/v0.5.0
[0.4.1]: https://github.com/cesarandreslopez/sidekick-docker/releases/tag/v0.4.1
