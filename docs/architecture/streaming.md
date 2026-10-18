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

### LogStreamManager

- Starts streaming when a container is selected on the Logs tab
- Maintains a ring buffer of the most recent 1000 log entries
- Feeds each log entry into three analytics processors:
    - **LogAnalytics** — running severity counts (ERROR, WARN, INFO, DEBUG, OTHER)
    - **LogSeverityTimeSeries** — 60-bucket ring buffer tracking severity distribution over time (1-minute buckets)
    - **LogTemplateEngine** — Drain-like pattern clustering that groups similar lines into templates with `<*>` wildcards
- Stops streaming when the user navigates away
- Resets all analytics when the selected container changes

### StatsStreamManager

- Starts streaming when a container is selected on the Stats tab
- Pushes samples to `StatsCollector` for time-series storage
- Stops streaming when the user navigates away

### ComposeLogStreamManager

- Starts streaming logs for a Compose project's services when selected in the Services panel
- Stops streaming when the user navigates away

### Reconnection & Resilience

Every followed stream — container logs, Compose logs and stats, in both the TUI and VS Code — runs through one shared policy, `FollowStream` (in `sidekick-docker-shared`'s events module). The TUI's `BaseStreamManager` creates one per selection; the VS Code service uses it through `LogSlot` (logs) and directly (stats).

- **Stopped targets end** — when a source ends and its container (or Compose service) is known to be stopped, the stream reports `ended` (or `empty` if it never produced anything) and does not reconnect. A follow stream of a stopped container ends right after its backlog, so reconnecting would only replay the same tail.
- **Running or unknown targets reconnect** with exponential backoff (2s doubling to 30s, at most 10 attempts, then `error` and a Retry control in VS Code).
- **Progress resets backoff** — only an attempt that delivered at least one accepted item resets the delay, so a source that keeps ending without new data eventually gives up.
- **Resume on start** — when the state store sees the target start again, a finished stream reconnects at once.
- **No duplicated tail** — `LogResumeCursor` remembers the last log timestamp; reconnects ask the daemon (or `docker compose logs`) for entries `since` then, and entries replayed from the same millisecond are dropped.
- **Immediate teardown** — each attempt owns an `AbortController`, aborted on `stop()`, which destroys the Docker HTTP connection or child process. A generation counter drops late items from a replaced attempt, including A → B → A selection changes.

Hiding the VS Code dashboard or disposing its service cancels its streams. Detail-load and stream-status messages use the typed extension/webview protocol, and retry requests are validated on receipt.

### State refresh

Both surfaces keep domain state in the shared `DockerStateStore`. Events patch it immediately where the event says enough (start, stop, die, pause, destroy, health status) and otherwise request a refresh, debounced by 500ms; healthcheck `exec_*` and other no-op events are ignored. A refresh pass lists containers once (`DockerClient.listResources()`), always commits — events that arrive mid-fetch are replayed over the result — and is abandoned after 20 seconds, keeping the previous data. A failed resource request retains its previous data while successful resources update, with warnings identifying the failures. Non-streaming Docker requests time out after 30 seconds; `docker compose` subprocesses have their own deadlines.

### EventWatcher

- Runs continuously while the dashboard is open (one loop, even across stop/start)
- Auto-reconnects on connection loss with exponential backoff
- Fires typed callbacks: `onEvent`, `onError`, `onReconnect`
- Feeds events into `DockerStateStore.processEvent()` (via the TUI's `DockerState` or the VS Code services) for incremental updates

## StatsCollector

A per-container ring buffer (default 60 samples) that stores stats history:

- `push(id, stats)` — add a new sample
- `getCpuSeries(id)` — returns array of CPU percentages for sparkline rendering
- `getMemorySeries(id)` — returns array of memory usage percentages
- `getLatest(id)` — returns the most recent stats sample
- `getNetworkRxRateSeries(id)` / `getNetworkTxRateSeries(id)` — compute network bytes/sec from consecutive cumulative sample deltas
- `getBlockReadRateSeries(id)` / `getBlockWriteRateSeries(id)` — compute block I/O bytes/sec from consecutive cumulative sample deltas
- `prune(activeIds)` — remove history entries for containers not in the active set (called during periodic refresh to prevent memory leaks)

The rate series methods derive per-second rates from Docker's cumulative counters by computing the delta between consecutive samples and dividing by elapsed time.

The 60-sample buffer at ~1 sample/second gives roughly 1 minute of history for the sparkline charts.
