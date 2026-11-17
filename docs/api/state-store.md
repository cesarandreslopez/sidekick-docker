# DockerStateStore

Domain state for one Docker endpoint, shared by the TUI (`DockerState` wraps it) and the VS Code extension (`DockerService` and `ContainerWatcherService`). It owns the refresh and Docker-event policy, so both surfaces behave the same.

## Usage

```typescript
import { DockerClient, DockerStateStore, EventWatcher } from 'sidekick-docker-shared';

const client = new DockerClient();
const store = new DockerStateStore({
  client,
  cwd: process.cwd(),                       // where to read the compose file; omit for none
  onChange: (change) => render(store.getSnapshot()),
});

await store.refresh();                      // first full pass

// The store is passive: the caller owns the event stream and any interval.
const watcher = new EventWatcher(client, { onEvent: (e) => store.processEvent(e) });
watcher.start();
const timer = setInterval(() => void store.refresh(), 30_000);
```

## Constructor Options

| Option | Default | Description |
|--------|---------|-------------|
| `client` | — | The `DockerClient` to read from |
| `cwd` | none | Directory to read compose file config from; undefined skips it |
| `composeReader` | `CachedComposeFileReader` | Source of compose file config (see [Compose](compose-detector.md#cachedcomposefilereader)) |
| `cliEnv` | none | Endpoint overrides for the default compose reader (see `dockerCliEnv`) |
| `include` | everything | Which lists to fetch: `{ images?, volumes?, networks?, compose? }`; containers are always fetched. The VS Code tree uses a containers-only store |
| `eventDebounceMs` | `500` | Coalescing window for event-triggered refreshes |
| `refreshTimeoutMs` | `20000` | A pass that takes longer is abandoned, keeping the previous data |
| `onChange` | — | Called after an event only when it changed the snapshot, but after **every** refresh pass, including one abandoned at the deadline. Receives a `StoreChange`: `{ cause: 'refresh', removedContainerIds, removedImageIds }` or `{ cause: 'event', event, removedContainerIds }` |
| `log` | — | Debug sink for swallowed errors |

## Methods

| Method | Description |
|--------|-------------|
| `getSnapshot()` | `DockerStateSnapshot`: containers, images, volumes, networks, composeProjects, composeFileConfig, daemonConnected, lastRefresh, resourceErrors. Arrays are replaced, never mutated |
| `refresh({ reloadCompose? })` | Resolves after a pass that started after the call commits; never rejects. `reloadCompose` bypasses the compose cache |
| `requestRefresh()` | Debounced refresh |
| `processEvent(event)` | Classify the event, patch state immediately, and request a refresh when the effect needs one |
| `isContainerRunning(id)` | `true`/`false`, or `undefined` when the container is unknown — what `FollowStream`'s `isTargetRunning` expects |
| `isComposeTargetRunning(project, service)` | The same for a Compose project or one service; `service` is `string \| null` (`null` = the whole project) |
| `getRunningContainerIds()` | IDs of running containers |
| `dispose()` | Cancel pending work |

## Behaviour

- **A pass always commits.** Events that arrive while a pass is fetching are journalled and replayed over its result, so a stale listing cannot resurrect a destroyed container, and a steady event stream cannot starve refreshes.
- **One container listing per pass**, via `DockerClient.listResources()`, which also feeds volume and network usage.
- **Deadline.** A pass that outlives `refreshTimeoutMs` is abandoned: previous data is kept, `resourceErrors` is set per kind, and the next pass is free to run.
- **Partial failures** keep the last good data for the failed kind and record why in `resourceErrors`.

## Event Policy

`classifyEvent(event)` and `applyEffect(containers, effect)` are pure functions, exported for testing and reuse:

| Events | Effect |
|--------|--------|
| container `exec_*`, attach, detach, resize, top, export, copy, archive-path, extract-to-dir, commit, kill, oom; `health_status` with an unknown detail; image push/save; volume mount/unmount; daemon-scoped events | Ignored |
| `health_status` | Patched in place |
| start, unpause, restart | Patched, then re-synced with a refresh |
| stop, die, pause | Patched |
| destroy | Removed |
| create, rename, update, unknown verbs; image/volume/network changes | Debounced refresh |
