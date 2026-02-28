# Changelog

All notable changes to the Sidekick Docker CLI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.1.1]: https://github.com/cesarandreslopez/sidekick-docker/releases/tag/v0.1.1
[0.1.0]: https://github.com/cesarandreslopez/sidekick-docker/releases/tag/v0.1.0
