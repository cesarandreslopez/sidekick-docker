# vscode — Design Spec

## Purpose

The VS Code extension provides a Docker dashboard, container tree, status bar, and quick-pick commands. The extension host is a Node.js CommonJS bundle; the webview is a browser IIFE bundle. Both consume the shared package through its public entry points.

## Interfaces

The extension exposes commands through `package.json`, including opening the dashboard or a split dashboard, container lifecycle actions, refresh, exec, and logs. `extension.ts` registers them. Settings are read through `settings.ts`; Docker action feedback goes through `providers/actionRegistry.ts` and `runDockerAction`.

The extension and webview exchange typed `postMessage()` payloads defined in `types/messages.ts`. Incoming webview messages are validated with `types/messageSchemas.ts`.

- Resource snapshots contain containers, images, volumes, networks, Compose projects, connection state, and optional per-resource refresh errors.
- Compose projects retain ordered configuration files; services carry replica details and running/total counts.
- Log and stats updates identify their source item. Detail results identify the container or image that was loaded.
- `detailLoad` reports loading, ready, or error states for Env, Files, and Layers. `retryDetail` requests a fresh load for the selected item.
- `streamState` reports loading, live, empty, ended, reconnecting, or error states. `retryStreams` resets the retry budget and restarts streams demanded by the current view.

## Components and Data Flow

| Component | Responsibility |
|-----------|----------------|
| `providers/DockerDashboardProvider.ts` | Webview lifecycle, initialization generation, message routing, and service view state |
| `providers/dashboardHtml.ts` | Dashboard HTML, CSS, CSP, and script loading |
| `services/DockerService.ts` | Resource state, refresh coalescing, details, view-driven streams, and Compose actions |
| `services/StreamSession.ts` | Abort signal and generation ownership for each stream |
| `services/ContainerWatcherService.ts` | Container tree polling, events, connection recovery, and disposal |
| `webview/dashboard.ts` | DOM rendering, selection reconciliation, and host messages |
| `webview/state.ts` | View state, persisted settings, resource caches, and load/stream statuses |
| `webview/keyboard.ts`, `webview/overlays.ts` | Shortcut routing, modal focus, menus, and filters |
| `webview/panels/` | Resource lists, detail tabs, and available actions |

Docker events update service state, with periodic full refreshes as a fallback. Concurrent refresh requests are coalesced. Partial failures preserve previously loaded data for the affected resource and expose a warning. Disposed services ignore pending refresh and detail completions.

View state controls primary logs, stats, Compose logs, and pinned comparison streams. Every stream has its own session; changing selection, hiding the dashboard, or disposing the service aborts obsolete work. Generations reject late output even when selection changes A → B → A. Empty streams do not reset the bounded reconnect budget. Stats-based sorting also samples other running containers.

The webview keeps its selected item and action target aligned with the visible list. Selecting another item preserves the active detail tab. Primary and comparison log updates render independently; Patterns updates when selected logs arrive. Background rendering preserves focus and scroll. Tab/Shift+Tab use native control traversal, and modal dialogs contain focus until closed.

Compose actions respect workspace trust and use the project's recorded directory and override files. Missing recorded files are reported before executing an action.

## Dependencies and Packaging

- Extension host: `sidekick-docker-shared`, `sidekick-docker-shared/log`, `vscode`, and `zod`; direct dockerode usage stays in the shared Docker facade.
- Webview: browser-safe `sidekick-docker-shared/log` and `sidekick-docker-shared/formatters`, shared types, and local webview modules. It cannot import `vscode`, dockerode, or Node.js runtime modules.
- The extension does not depend on the CLI package. `scripts/check-imports.mjs` enforces the module graph.
- Shared formatters and log analysis are imported rather than copied. Webview-specific HTML escaping, theme colors, and rendering remain local.
- The host bundle includes `ssh2`, using JavaScript fallbacks for optional native accelerators. Production packaging minifies both bundles. `npm run test:packages` checks SSH through the production VSIX with a local fixture.

## Validation

Service tests cover stream cancellation, stale results, retry exhaustion, partial refreshes, detail retries, and disposal. DOM tests exercise selection reconciliation, keyboard and modal behavior, comparison updates, Patterns updates, and retry controls. Type checking, lint, import checks, package tests, and builds complete the repository validation gate.
