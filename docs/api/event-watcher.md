# EventWatcher

Wraps `DockerClient.streamEvents()` with auto-reconnection and typed callbacks.

## Usage

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

## Constructor Options

| Option | Type | Description |
|--------|------|-------------|
| `onEvent` | `(event: DockerEvent) => void` | Called for each Docker event |
| `onError` | `(error: Error) => void` | Called when the event stream encounters an error |
| `onReconnect` | `() => void` | Called when the watcher successfully reconnects after a disconnection |

## Methods

| Method | Description |
|--------|-------------|
| `start()` | Begin watching Docker events |
| `stop()` | Stop watching and close the stream |

## Auto-Reconnect

If the event stream disconnects (Docker daemon restart, network interruption), the watcher automatically reconnects with exponential backoff. The `onReconnect` callback fires when the connection is re-established.

## DockerEvent Type

Each event contains:

| Field | Type | Description |
|-------|------|-------------|
| `type` | `string` | Event action (e.g., `start`, `stop`, `create`, `destroy`) |
| `resourceType` | `DockerResourceType` | Resource category (`container`, `image`, `volume`, `network`) |
| `resourceId` | `string` | ID of the affected resource |
| `timestamp` | `Date` | Timestamp of the event |
| `attributes` | `Record<string, string>` | Additional event metadata |
