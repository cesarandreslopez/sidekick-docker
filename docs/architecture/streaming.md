# Streaming Architecture

Sidekick Docker uses `AsyncIterable` (async generators) throughout for streaming data from the Docker daemon.

## Pattern

All streaming methods in `DockerClient` return `AsyncIterable`:

```typescript
streamLogs(id: string, opts?: LogStreamOptions): AsyncIterable<LogEntry>
streamStats(id: string): AsyncIterable<ContainerStats>
streamEvents(filters?: Record<string, string[]>): AsyncIterable<DockerEvent>
```

Consumers iterate with `for await`:

```typescript
for await (const entry of client.streamLogs(containerId)) {
  // process each log entry
}
```

## Stream Managers

The dashboard uses manager classes to control when streaming starts and stops. Streaming is **selection-driven** — it only runs for the currently selected container, avoiding unnecessary resource usage.

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

### EventWatcher

- Runs continuously while the dashboard is open
- Auto-reconnects on connection loss with exponential backoff
- Fires typed callbacks: `onEvent`, `onError`, `onReconnect`
- Feeds events into `DockerState.processEvent()` for incremental updates

## StatsCollector

A per-container ring buffer (default 60 samples) that stores stats history:

- `push(id, stats)` — add a new sample
- `getCpuSeries(id)` — returns array of CPU percentages for sparkline rendering
- `getMemorySeries(id)` — returns array of memory usage values
- `getLatest(id)` — returns the most recent stats sample

The 60-sample buffer at ~1 sample/second gives roughly 1 minute of history for the sparkline charts.
