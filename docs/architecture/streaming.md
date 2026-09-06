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

All stream managers use `ReconnectScheduler` for fault-tolerant streaming:

- **Immediate teardown** — each stream manager owns an `AbortController` that is aborted on `stop()`, immediately destroying the underlying Docker HTTP connection or child process
- **Generation counter** — monotonically increasing counter invalidates stale reconnect callbacks when selections change rapidly
- **Exponential backoff** — retry delays increase on consecutive failures, preventing rapid retry storms
- **Bounded retries** — streams give up after a maximum number of attempts on permanent failures
- **Error logging** — all stream errors are logged for debugging
- **Resource cleanup** — try/finally blocks ensure proper teardown on failure

The VS Code service gives each primary and comparison stream a `StreamSession` with its own abort signal and generation. Late output from a replaced session is ignored, including A → B → A selection changes. Hiding the dashboard or disposing the service cancels its streams. Empty responses do not reset the reconnect budget; after repeated failures the webview offers Retry. Detail-load and stream-status messages use the typed extension/webview protocol, and retry requests are validated on receipt.

Concurrent resource refreshes are coalesced. A failed resource request retains its previous data while successful resources update, with warnings identifying the failures. Disposed services ignore pending refresh and detail completions.

### EventWatcher

- Runs continuously while the dashboard is open
- Auto-reconnects on connection loss with exponential backoff
- Fires typed callbacks: `onEvent`, `onError`, `onReconnect`
- Feeds events into `DockerState.processEvent()` for incremental updates

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
