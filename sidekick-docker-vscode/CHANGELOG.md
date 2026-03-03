# Changelog

All notable changes to the Sidekick Docker VS Code extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.1.3]: https://github.com/cesarandreslopez/sidekick-docker/releases/tag/v0.1.3
[0.1.2]: https://github.com/cesarandreslopez/sidekick-docker/releases/tag/v0.1.2
[0.1.1]: https://github.com/cesarandreslopez/sidekick-docker/releases/tag/v0.1.1
[0.1.0]: https://github.com/cesarandreslopez/sidekick-docker/releases/tag/v0.1.0
