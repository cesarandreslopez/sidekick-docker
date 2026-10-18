# EventWatcher & FollowStream

## EventWatcher

Wraps `DockerClient.streamEvents()` with auto-reconnection and typed callbacks.

### Usage

```typescript
import { EventWatcher } from 'sidekick-docker-shared';

const watcher = new EventWatcher(client, {
  onEvent: (event) => console.log(event.type, event.resourceType, event.resourceId),
  onError: (err) => console.error(err),
  onReconnect: () => console.log('reconnected'),
});
watcher.start();
// later:
watcher.stop();
```

### Constructor Options

| Option | Type | Description |
|--------|------|-------------|
| `onEvent` | `(event: DockerEvent) => void` | Called for each Docker event |
| `onError` | `(error: Error) => void` | Called when the event stream encounters an error |
| `onReconnect` | `() => void` | Called when the watcher successfully reconnects after a disconnection |

### Methods

| Method | Description |
|--------|-------------|
| `start()` | Begin watching Docker events |
| `stop()` | Stop watching and close the stream |

### Auto-Reconnect

If the event stream disconnects (Docker daemon restart, network interruption), the watcher automatically reconnects with exponential backoff. The `onReconnect` callback fires when the connection is re-established. `stop()` followed by `start()` keeps a single watch loop running.

### DockerEvent Type

Each event contains:

| Field | Type | Description |
|-------|------|-------------|
| `type` | `string` | Event action (e.g., `start`, `stop`, `create`, `destroy`) |
| `resourceType` | `DockerResourceType` | Resource category (`container`, `image`, `volume`, `network`) |
| `resourceId` | `string` | ID of the affected resource |
| `timestamp` | `Date` | Timestamp of the event |
| `attributes` | `Record<string, string>` | Additional event metadata |

## FollowStream

The events module also holds the reconnect policy for followed streams (logs, stats), used by both dashboards:

```typescript
import { FollowStream, LogResumeCursor } from 'sidekick-docker-shared';

const cursor = new LogResumeCursor();
const stream = new FollowStream<LogEntry>({
  open: (signal, { reconnect }) => client.streamLogs(id,
    reconnect && cursor.sinceSeconds() !== undefined ? { follow: true, since: cursor.sinceSeconds() } : { follow: true, tail: 100 }, signal),
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
```

| Situation | Result |
|-----------|--------|
| Source ends, `isTargetRunning()` is `false` | `ended` (or `empty` if nothing was received) — no reconnect |
| Source ends or throws, target running or unknown | `reconnecting`, exponential backoff (2s → 30s) |
| 10 reconnects without an accepted item | `error` |
| `resume()` on a finished stream whose target now runs | reconnects immediately |

`LogResumeCursor` records the last log timestamp: `sinceSeconds()` (Docker API) / `sinceIso()` (`docker compose logs --since`) give the resume point, and `isReplay()` drops entries the daemon re-sends from that same millisecond.
