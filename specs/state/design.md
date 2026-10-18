# state — Design Spec

## Purpose
Domain state for one Docker endpoint, shared by the TUI (`cli/dashboard/DockerState`) and the VS Code
extension (`DockerService`, `ContainerWatcherService`). Owns the refresh/event policy the two used to
duplicate — and had let drift.

## Public Interface

Exports from `sidekick-docker-shared/src/state/`:

- `DockerStateStore`
  - `constructor({ client, cwd?, composeReader?, cliEnv?, include?, eventDebounceMs?, refreshTimeoutMs?, onChange?, log? })`
  - `getSnapshot()` → `DockerStateSnapshot` (containers, images, volumes, networks, composeProjects,
    composeFileConfig, daemonConnected, lastRefresh, resourceErrors). Arrays are replaced, never mutated.
  - `refresh({ reloadCompose? })` — resolves after a pass that started after the call commits; never rejects.
  - `requestRefresh()` — debounced (default 500ms).
  - `processEvent(event)` — classify, patch immediately, request a refresh when the effect needs one.
  - `isContainerRunning(id)`, `isComposeTargetRunning(project, service)`, `getRunningContainerIds()`
  - `dispose()`
- `classifyEvent(event)` / `applyEffect(containers, effect)` / `splitEventAction(type)` — pure event policy.

## Behaviour

- **Passive.** No event stream, no polling interval: callers own those (VS Code stops them when hidden).
- **A pass always commits.** Events arriving mid-fetch are journalled and replayed over the fetched
  lists, so a stale listing cannot resurrect a destroyed container, and a steady event stream cannot
  starve refreshes.
- **Event table.** Healthcheck `exec_*`, attach/resize/kill/oom, volume mount/unmount and daemon events
  are ignored. `health_status` patches in place. start/unpause/restart patch then re-sync; stop/die/pause
  patch; destroy removes; create/rename/update/unknown verbs and image/volume/network changes refresh
  (debounced).
- **Deadline.** A pass that outlives `refreshTimeoutMs` (20s) is abandoned: previous data kept,
  `resourceErrors` set per kind, next pass free to run.
- **One container listing per pass** via `DockerClient.listResources`, and compose config via
  `CachedComposeFileReader` (spawns `docker compose config` only when the compose files change).

## Dependencies

- **Allowed imports**: `docker`, `compose`, `types`
- **Forbidden imports**: `events`, `log`, `stats`, `core`
