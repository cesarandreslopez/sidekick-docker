# Changelog

This page mirrors the [CHANGELOG.md](https://github.com/cesarandreslopez/sidekick-docker/blob/main/CHANGELOG.md) in the repository.

All notable changes to this project will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
