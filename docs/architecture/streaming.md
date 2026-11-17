# Streaming Architecture

Sidekick Docker uses `AsyncIterable` (async generators) throughout for streaming data from the Docker daemon.

## Pattern

All streaming methods in `DockerClient` return `AsyncIterable` and accept an optional `AbortSignal` for immediate teardown:

```typescript
streamLogs(id: string, opts?: LogStreamOptions, signal?: AbortSignal): AsyncIterable<LogEntry>
streamStats(id: string, signal?: AbortSignal): AsyncIterable<ContainerStats>
streamEvents(filters?: Record<string, string[]>, signal?: AbortSignal): AsyncIterable<DockerEvent>
```

Consumers iterate with `for await`:

```typescript
const controller = new AbortController();
for await (const entry of client.streamLogs(containerId, {}, controller.signal)) {
  // process each log entry
}
// controller.abort() immediately destroys the underlying stream
```

Cancellation also reaches pending Docker requests. Streaming decoders preserve UTF-8 characters and JSON records split across transport chunks, and flush final records without a newline. Live container logs inspect the TTY flag to distinguish raw terminal output from multiplexed stdout/stderr frames. Compose logs decode stdout and stderr separately, flush trailing lines, and surface command failures.

## Stream Managers

The dashboards use view state to control when streaming starts and stops. Log and stats streams follow the selected item and detail tab; a pinned comparison can request a second log stream. Stats-based sorting also samples other running containers so every visible row can be compared.

The TUI (`commands/dashboard.ts`) runs five managers built from three classes: primary and secondary (compare) container logs, primary and secondary Compose logs, and stats. What each one streams comes from the pure `viewTargets()` in `commands/viewTargets.ts`. The first view applies at once; after that, a selection change stops the old streams immediately and starts the new ones once the selection has been still for 150 ms (`VIEW_SETTLE_MS`), so holding `j` through a list no longer opens a stream per row.

### LogStreamManager

- In the TUI, streams the selected container on every Containers tab (Patterns, Copy Logs and the Stats tab read the buffer too); VS Code streams container logs only on the Logs and Patterns tabs
- Maintains a ring buffer of the most recent 1000 log entries
- Feeds each log entry into three analytics processors:
    - **LogAnalytics** — running severity counts (ERROR, WARN, INFO, DEBUG, OTHER)
    - **LogSeverityTimeSeries** — 60-bucket ring buffer tracking severity distribution over time (1-minute buckets)
    - **LogTemplateEngine** — Drain-like pattern clustering that groups similar lines into templates with `<*>` wildcards
- Stops streaming when the user navigates away
- Resets all analytics when the selected container changes

### StatsStreamManager

- Starts streaming when a container is selected on the Stats tab, or on any Containers tab while the sort field needs live data (CPU, memory, network, block I/O, PIDs)
- Pushes samples to `StatsCollector` for time-series storage
- Stops streaming when the user navigates away

### ComposeLogStreamManager

- Streams only on the Services panel's Logs tab: a project follows all its services, a service item follows just that service
- Stops streaming when the user navigates away

### BaseStreamManager

All three extend `BaseStreamManager<TId, TItem>`, which owns the selection (`select(id)`, `stop()`, `dispose()`) and creates one `FollowStream` per selection. Subclasses implement eight abstract members: `streamLabel`, `emptyId()`, `isSameId(a, b)`, `isValidId(id)`, `idLabel(id)`, `createStream(id, signal, attempt: { reconnect })`, `processItem(id, item)` and `onClear()`. Optional hooks: `acceptItem(item)` (return `false` to drop an item a reconnect replayed), `onBeforeStream()` (before every attempt), `onStop()` and `onStreamState(state)`. The constructor takes `{ isTargetRunning }`; `targetStateChanged()` resumes a finished stream whose target runs again, and `getStreamState()` returns the current `FollowStreamState` (`null` when nothing is selected).

### Reconnection & Resilience

Every followed stream — container logs, Compose logs and stats, in both the TUI and VS Code — runs through one shared policy, `FollowStream` (in `sidekick-docker-shared`'s events module). The TUI's `BaseStreamManager` creates one per selection; the VS Code service uses it through `LogSlot` (logs) and directly (stats).

- **Stopped targets end** — when a source ends normally and its container (or Compose service) is known to be stopped, the stream reports `ended` (or `empty` if it never produced anything) and does not reconnect. A follow stream of a stopped container ends right after its backlog, so reconnecting would only replay the same tail.
- **Running or unknown targets reconnect** with exponential backoff (2s doubling to 30s, at most 10 attempts, then `error` and a Retry control in VS Code). A source that throws reconnects the same way, even when its target is stopped.
- **Progress resets backoff** — only an attempt that delivered at least one accepted item resets the delay, so a source that keeps ending without new data eventually gives up.
- **Resume on start** — when the state store sees the target start again, a finished stream reconnects at once.
- **No duplicated tail** — `LogResumeCursor` remembers the last log timestamp; reconnects ask the daemon (or `docker compose logs`) for entries `since` then (with a tail of 1000 rather than the first connect's 100). While resuming, every entry older than the cursor is dropped, as are those already seen at its exact millisecond.
- **Immediate teardown** — each attempt owns an `AbortController`, aborted on `stop()`, which destroys the Docker HTTP connection or child process. A generation counter drops late items from a replaced attempt, including A → B → A selection changes.

Hiding the VS Code dashboard or disposing its service cancels its streams. Detail-load and stream-status messages use the typed extension/webview protocol, and retry requests are validated on receipt.

### State refresh

Both surfaces keep domain state in the shared `DockerStateStore`. Events patch it immediately where the event says enough (start, unpause, restart, stop, die, pause, destroy, health status) and otherwise request a refresh, debounced by 500ms; healthcheck `exec_*` and other no-op events are ignored. A refresh pass lists containers once (`DockerClient.listResources()`), always commits — events that arrive mid-fetch are replayed over the result — and is abandoned after 20 seconds, keeping the previous data. A failed resource request retains its previous data while successful resources update, with warnings identifying the failures. Non-streaming Docker reads time out after 30 seconds (start, stop, restart, pause, remove and prune calls have no deadline); `docker compose` subprocesses have their own deadlines.

### EventWatcher

- In the TUI, runs for the dashboard's lifetime (one loop, even across stop/start). An event-stream error triggers an immediate refresh, and while the daemon is unreachable the dashboard also polls every 5 s
- In VS Code, the dashboard's watcher runs only while the dashboard is visible. The tree's always-on `ContainerWatcherService` replaces its watcher on a stream error instead: it re-pings and reconnects, at most once per 10 s, then falls back to a 10 s reconnect poll
- Auto-reconnects on connection loss with exponential backoff (2 s → 30 s) and never gives up
- Fires typed callbacks: `onEvent`, and the optional `onError` and `onReconnect`
- Feeds events into `DockerStateStore.processEvent()` (via the TUI's `DockerState` or the VS Code services) for incremental updates

## StatsCollector

A per-container ring buffer (default 60 samples) that stores stats history:

- `push(id, stats)` — add a new sample
- `getCpuSeries(id)` — returns array of CPU percentages for sparkline rendering
- `getMemorySeries(id)` — returns array of memory usage percentages
- `getLatest(id)` — returns the most recent stats sample
- `getNetworkRxRateSeries(id)` / `getNetworkTxRateSeries(id)` — compute network bytes/sec from consecutive cumulative sample deltas
- `getBlockReadRateSeries(id)` / `getBlockWriteRateSeries(id)` — compute block I/O bytes/sec from consecutive cumulative sample deltas
- `prune(activeIds)` — remove history entries for containers not in the active set. The TUI calls it with the running container IDs on every refresh pass; VS Code instead drops a removed container's history with `remove(id)`

The rate series methods derive per-second rates from Docker's cumulative counters by computing the delta between consecutive samples and dividing by elapsed time.

A live stats stream delivers about one sample per second, so the 60-sample buffer holds roughly a minute for the selected container. While the list is sorted by a stats field, `StatsSampler` also pushes a sample every 3 s for every running container, so rows that are not streamed span about three minutes.
