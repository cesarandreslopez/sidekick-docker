# events — Design Spec

## Purpose
Real-time Docker event streaming with automatic reconnection via exponential backoff.

## Public Interface

Exports from `sidekick-docker-shared/src/events/`:

- `EventWatcher` — Streams Docker daemon events, auto-reconnects on failure
  - `constructor(client, callbacks)` — Takes DockerClient and callback handlers
  - `start()` — Begin watching
  - `stop()` — Stop watching and clean up
- `EventWatcherCallbacks` — `{ onEvent, onError }`
- `ReconnectScheduler` — Exponential backoff timer for stream reconnection
  - `schedule(callback)` → boolean (false if max attempts reached)
  - `clear()` — Cancel pending reconnect
  - `reset()` — Reset backoff state after successful connection
- `INITIAL_RECONNECT_DELAY` — 2000ms
- `MAX_RECONNECT_DELAY` — 30000ms
- `MAX_RECONNECT_ATTEMPTS` — 10

## Internal Structure

**Current:**
```
sidekick-docker-shared/src/events/
├── EventWatcher.ts         # Docker event stream consumer
├── EventWatcher.test.ts    # Tests
sidekick-docker-shared/src/
└── reconnect.ts            # ReconnectScheduler (at package root)
```

**Target:**
```
sidekick-docker-shared/src/events/
├── EventWatcher.ts         # Docker event stream consumer
├── EventWatcher.test.ts    # Tests
└── reconnect.ts            # ReconnectScheduler (moved from root)
```

## Dependencies

- **Allowed imports**: `docker` (DockerClient), `types` (DockerEvent, EventType)
- **Forbidden imports**: `compose`, `log`, `stats`, `core`

## Files to Move

| Source (current) | Destination (target) | Notes |
|-----------------|---------------------|-------|
| shared/src/reconnect.ts | shared/src/events/reconnect.ts | Only consumer is EventWatcher |

**Migration steps:**
1. Move file
2. Update EventWatcher.ts import: `'../reconnect'` → `'./reconnect'`
3. Update shared/src/index.ts barrel: `'./reconnect'` → `'./events/reconnect'`
4. Run `npx tsc --noEmit` to verify
5. Run `npm test` to verify

## Open Questions

- None.
