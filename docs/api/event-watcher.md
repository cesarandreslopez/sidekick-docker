# EventWatcher & FollowStream

## EventWatcher

Wraps `DockerClient.streamEvents()` with auto-reconnection and typed callbacks.

### Usage

```typescript
import { EventWatcher } from 'sidekick-docker-shared';

const watcher = new EventWatcher(client, {
  onEvent: (event) => console.log(event.type, event.resourceType, event.resourceId),
  onError: (err) => console.error(err),
  onReconnect: () => console.log('stream lost, reconnecting'),
});
watcher.start();
// later:
watcher.stop();
```

### Constructor Options

| Option | Type | Description |
|--------|------|-------------|
| `onEvent` | `(event: DockerEvent) => void` | Called for each Docker event |
| `onError` | `(error: Error) => void` | Optional. Called when the event stream fails |
| `onReconnect` | `() => void` | Optional. Called as soon as the stream ends or fails (after `onError` for a failure), *before* the backoff wait — it announces a reconnect attempt, not a successful one |

### Methods

| Method | Description |
|--------|-------------|
| `start()` | Begin watching Docker events (no-op while running) |
| `stop()` | Stop watching and close the stream |
| `isRunning` | Getter: `true` between `start()` and `stop()` |

### Auto-Reconnect

If the event stream ends or fails (Docker daemon restart, network interruption), the watcher fires `onReconnect`, waits, and opens a new stream. The wait starts at 2s and doubles on each failure up to 30s; a delivered event or a normal end resets it to 2s. It never gives up — only `stop()` ends the loop. `stop()` followed by `start()` keeps a single watch loop running.

### DockerEvent Type

Each event contains:

| Field | Type | Description |
|-------|------|-------------|
| `type` | `string` | Event action (e.g., `start`, `stop`, `create`, `destroy`, `health_status: healthy`) |
| `resourceType` | `DockerResourceType` | Resource category (`container`, `image`, `volume`, `network`, or `daemon` for any other type) |
| `resourceId` | `string` | ID of the affected resource |
| `timestamp` | `Date` | Timestamp of the event |
| `attributes` | `Record<string, string>` | Additional event metadata |

## FollowStream

The events module also holds the reconnect policy for followed streams (logs, stats), used by both dashboards. This mirrors what the TUI's `LogStreamManager` and VS Code's `LogSlot` do:

```typescript
import { FollowStream, LogResumeCursor, MAX_LOG_LINES } from 'sidekick-docker-shared';

const cursor = new LogResumeCursor();
const stream = new FollowStream<LogEntry>({
  open: (signal, { reconnect }) => {
    if (reconnect) cursor.beginResume();   // arm replay filtering for this attempt
    const since = reconnect ? cursor.sinceSeconds() : undefined;
    return client.streamLogs(id, since === undefined
      ? { follow: true, tail: 100 }
      : { follow: true, tail: MAX_LOG_LINES, since }, signal);
  },
  accept: (entry) => !cursor.isReplay(entry),
  onItem: (entry) => { cursor.observe(entry); render(entry); },
  isTargetRunning: () => store.isContainerRunning(id),
  onState: (state) => console.log(state), // loading | live | reconnecting | ended | empty | error
});
stream.start();
// when the container starts again:
stream.resume();
// on deselect (final):
stream.stop();
cursor.reset();
```

| Situation | Result |
|-----------|--------|
| Source ends, `isTargetRunning()` is `false` | `ended` (or `empty` if nothing was received) — no reconnect |
| Source ends with the target running or unknown, or throws (whatever the target's state) | `reconnecting`, exponential backoff (2s → 30s) |
| 10 reconnects in a row without an accepted item | `error` |
| `resume()` on an `ended`/`empty` stream whose target now runs | reconnects immediately |

Other options: `onAttemptEnd()` runs after each attempt (e.g. to flush a buffer), `onError(err)` receives source errors for logging, and `scheduler` injects a `ReconnectScheduler`. The `state` getter returns the current `FollowStreamState`.

`ReconnectScheduler` (`schedule(cb)`, `clear()`, `reset()`) is the backoff behind it: `INITIAL_RECONNECT_DELAY` (2000 ms) doubling to `MAX_RECONNECT_DELAY` (30000 ms); `schedule()` returns `false` once `MAX_RECONNECT_ATTEMPTS` (10) is reached. `EventWatcher` uses the two delay constants but not the attempt cap.

`LogResumeCursor` records the last log timestamp: `observe()` advances it, and `sinceSeconds()` (Docker API) / `sinceIso()` (`docker compose logs --since`) give the resume point. `beginResume()` arms replay filtering for the reconnect about to start (a first connect is never filtered); until the next `beginResume()`, `isReplay()` drops every entry older than the cursor, plus entries at its exact millisecond that were already seen (counted by message). Entries without a timestamp are never replays. `reset()` forgets everything — call it when the selection changes.
