# Sidekick Docker Shared

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/cesarandreslopez/sidekick-docker/blob/main/LICENSE)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/cesarandreslopez/sidekick-docker)

The Docker API abstraction layer that powers Sidekick Docker. Wraps dockerode into a typed, opinionated facade with async generators for streaming, Compose detection, and stats collection — plus the state store, stream reconnect policy and UI rules that the TUI and the VS Code extension share.

## Install

This package is **not published to npm**. It is an internal package of the
[sidekick-docker](https://github.com/cesarandreslopez/sidekick-docker) monorepo, consumed by
the CLI and the VS Code extension through a local `file:` dependency:

```json
"sidekick-docker-shared": "file:../sidekick-docker-shared"
```

To work with it, clone the monorepo and build it first — the two consumers import from `dist/`:

```bash
git clone https://github.com/cesarandreslopez/sidekick-docker.git
cd sidekick-docker/sidekick-docker-shared
npm install && npm run build
```

## API Reference

### DockerClient

The main facade for all Docker operations. All methods return typed results — never raw dockerode objects.

```typescript
import { DockerClient } from 'sidekick-docker-shared';

const client = new DockerClient();
// or with options:
const client = new DockerClient({ socketPath: '/var/run/docker.sock' });
const client = new DockerClient({ host: '192.168.1.100', port: 2375 });
const client = new DockerClient({ requestTimeoutMs: 10_000 }); // non-streaming reads; default 30s
```

A read that outlives `requestTimeoutMs` rejects with `DockerTimeoutError`; streams are exempt.

#### Container Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `ping` | `() => Promise<boolean>` | Check Docker daemon connectivity |
| `pingDetailed` | `() => Promise<PingResult>` | Like `ping()`, keeping the error (pair with `explainDockerUnreachable`) |
| `listContainers` | `(all?: boolean, signal?: AbortSignal) => Promise<ContainerInfo[]>` | List containers (default: all including stopped) |
| `listResources` | `(opts?: ListResourcesOptions) => Promise<ResourceListing>` | Containers, images, volumes and networks from one container listing; each list settles independently |
| `startContainer` | `(id: string) => Promise<void>` | Start a container |
| `stopContainer` | `(id: string) => Promise<void>` | Stop a container |
| `restartContainer` | `(id: string) => Promise<void>` | Restart a container |
| `pauseContainer` / `unpauseContainer` | `(id: string) => Promise<void>` | Pause / unpause a container |
| `removeContainer` | `(id: string, force?: boolean) => Promise<void>` | Remove a container |
| `pruneContainers` | `() => Promise<{ containersDeleted: string[]; spaceReclaimed: number }>` | Remove all stopped containers |
| `inspectContainer` | `(id: string) => Promise<ContainerInspectInfo>` | Get full container details |
| `getContainerDetails` | `(id: string) => Promise<ContainerDetails>` | One inspect call: env, restart policy/count, mounts, exit code, OOM, error, health log |
| `getContainerEnv` | `(id: string) => Promise<string[]>` | Get container environment variables |
| `sampleStats` | `(id: string) => Promise<ContainerStats>` | One-shot stats reading |
| `getContainerChanges` | `(id: string) => Promise<FilesystemChange[]>` | Get filesystem changes vs base image |
| `streamLogs` | `(id: string, opts?: LogStreamOptions, signal?: AbortSignal) => AsyncIterable<LogEntry>` | Stream container logs |
| `streamStats` | `(id: string, signal?: AbortSignal) => AsyncIterable<ContainerStats>` | Stream live container stats |

#### Image Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `listImages` | `(all?: boolean) => Promise<ImageInfo[]>` | List images |
| `getImageHistory` | `(nameOrId: string) => Promise<ImageLayer[]>` | Get image layer history |
| `removeImage` | `(id: string) => Promise<void>` | Remove an image |
| `pruneImages` | `() => Promise<{ spaceReclaimed: number }>` | Remove dangling images |

#### Volume Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `listVolumes` | `() => Promise<VolumeInfo[]>` | List volumes (includes usage detection) |
| `removeVolume` | `(name: string) => Promise<void>` | Remove a volume |
| `pruneVolumes` | `() => Promise<{ spaceReclaimed: number }>` | Remove unused volumes |

#### Network Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `listNetworks` | `() => Promise<NetworkInfo[]>` | List networks with connected containers |
| `removeNetwork` | `(id: string) => Promise<void>` | Remove a network |
| `pruneNetworks` | `() => Promise<{ networksDeleted: string[] }>` | Remove unused networks |

#### System & Events

| Method | Signature | Description |
|--------|-----------|-------------|
| `diskUsage` | `() => Promise<DiskUsage>` | `docker system df`: images, containers, volumes, build cache |
| `streamEvents` | `(filters?: Record<string, string[]>, signal?: AbortSignal) => AsyncIterable<DockerEvent>` | Stream Docker daemon events |

Abort signals cancel both pending requests and active streams. Decoders preserve JSON records and UTF-8 characters across transport chunks, and live logs distinguish TTY output from multiplexed stdout/stderr.

### ComposeDetector

Discovers Compose projects from container labels (`com.docker.compose.project`, `com.docker.compose.service`). Optionally merges with compose file config to include services with no running containers.

```typescript
import { ComposeDetector } from 'sidekick-docker-shared';

const detector = new ComposeDetector();
const containers = await client.listContainers();
const projects = detector.detect(containers);
```

Projects retain optional `workingDir`, `configFile`, and ordered `configFiles` metadata. Each service aggregates its discovered replicas into `replicas`, `runningReplicas`, and `totalReplicas`; the existing `containerId` identifies a representative, preferring a running replica. These fields are optional on the public types for compatibility.

### ComposeClient

Wraps `docker compose` CLI commands.

```typescript
import { ComposeClient } from 'sidekick-docker-shared';

const compose = new ComposeClient();
await compose.up('my-project');
await compose.down('my-project');
await compose.restart('my-project', 'web');
```

Lifecycle methods also accept `ComposeCommandOptions` (`{ cwd?: string; configFiles?: string[] }`) in place of the optional string `cwd`. Use `resolveComposeOptions(project, fallbackDirectory)` to resolve the recorded files, preserve override order, and reject missing paths before an action. Pass each result to `throwIfComposeFailed(result, operation)` to surface command failures.

`new ComposeClient(extraEnv?, { queryTimeoutMs?, actionTimeoutMs? })` targets the same endpoint as the API client via `extraEnv` (see `dockerCliEnv`) and kills hung commands (defaults: 30s for queries, 15 min for lifecycle actions). Commands run through `runProcess(cmd, args, { cwd?, env?, timeoutMs?, signal? })`, which decodes output safely and resolves with exit code `124` on timeout.

`compose.streamLogs(project, service?, tail = 100, signal?, since?)` returns an `AsyncIterable<LogEntry>`. It preserves split UTF-8 and final unterminated lines, throws on command failure, and terminates its subprocess on cancellation. See the [Compose API reference](https://cesarandreslopez.github.io/sidekick-docker/api/compose-detector/) for examples.

`CachedComposeFileReader` wraps `ComposeFileReader` (`docker compose config`) so the config is re-read only when a compose file changes: `new CachedComposeFileReader(new ComposeFileReader(cliEnv)).read(cwd, { force? })`.

### DockerStateStore

Domain state for one endpoint — the refresh and Docker-event policy both dashboards share. Passive: you feed it events and call `refresh()`.

```typescript
import { DockerStateStore } from 'sidekick-docker-shared';

const store = new DockerStateStore({ client, cwd: process.cwd(), onChange: () => render(store.getSnapshot()) });
await store.refresh();
new EventWatcher(client, { onEvent: e => store.processEvent(e) }).start();
```

Event-driven refreshes are debounced (500ms), no-op events (healthcheck `exec_*`, …) are ignored, events during a refresh are replayed over its result, and a pass is abandoned after 20s. `classifyEvent`/`applyEffect` expose the event policy as pure functions.

### EventWatcher

Wraps `DockerClient.streamEvents()` with auto-reconnection and typed callbacks.

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

### FollowStream & LogResumeCursor

One followed stream (logs, stats) with the shared reconnect policy: a source whose target is stopped ends (`ended`/`empty`) instead of reconnecting; otherwise it reconnects with exponential backoff, and `resume()` restarts it when the target runs again. `LogResumeCursor` turns the last seen timestamp into a `since` for reconnects and drops replayed entries.

```typescript
import { FollowStream, LogResumeCursor } from 'sidekick-docker-shared';

const cursor = new LogResumeCursor();
const stream = new FollowStream<LogEntry>({
  open: (signal, { reconnect }) => client.streamLogs(id, { follow: true, ...(reconnect ? { since: cursor.sinceSeconds() } : { tail: 100 }) }, signal),
  accept: e => !cursor.isReplay(e),
  onItem: e => { cursor.observe(e); show(e); },
  isTargetRunning: () => store.isContainerRunning(id),
});
stream.start();
```

### StatsCollector

Per-container ring buffer (default 60 samples) for stats history. Provides derived time-series data for charting.

```typescript
import { StatsCollector } from 'sidekick-docker-shared';

const collector = new StatsCollector();

for await (const stats of client.streamStats(containerId)) {
  collector.push(containerId, stats);
  const cpuSeries = collector.getCpuSeries(containerId);
  const memSeries = collector.getMemorySeries(containerId);
  const latest = collector.getLatest(containerId);
}
```

### Formatters

Utility functions for display formatting.

```typescript
import { formatBytes, formatCpu, formatMemory, formatPorts, stateIcon, stateColor, truncate } from 'sidekick-docker-shared';

formatBytes(1073741824);     // "1.0 GB"
formatCpu(45.23);            // "45.23%"
stateIcon('running');        // colored icon character
```

The same module holds the UI rules both dashboards follow, so they cannot drift: `canStart`/`canStop`, `pruneCandidateCount`/`pruneConfirmMessage`, `removeContainerConfirmMessage`, `sortDirectionLabel` ("A→Z", "highest first"…), `publishedPortUrls`/`browserHostForEndpoint`, `actionText`, and the Config-tab helpers `summarizeHealth`, `summarizeRestartPolicy`, `formatMount`. It is browser-safe and also exported as `sidekick-docker-shared/formatters`.

## Types

All types are exported from the package root.

```typescript
import type {
  ContainerInfo,
  ContainerStats,
  ContainerDetails,
  FilesystemChange,
  LogEntry,
  PortBinding,
  ImageInfo,
  ImageLayer,
  VolumeInfo,
  NetworkInfo,
  NetworkContainerRef,
  ComposeProject,
  ComposeService,
  DockerEvent,
  DockerResourceType,
} from 'sidekick-docker-shared';
```

## Usage Examples

### List all running containers

```typescript
import { DockerClient } from 'sidekick-docker-shared';

const client = new DockerClient();
const containers = await client.listContainers();

for (const c of containers) {
  console.log(`${c.name} (${c.state}) — ${c.image}`);
}
```

### Stream logs from a container

```typescript
for await (const entry of client.streamLogs(containerId, { tail: 50 })) {
  console.log(`[${entry.stream}] ${entry.message}`);
}
```

### Watch Docker events

```typescript
for await (const event of client.streamEvents()) {
  console.log(`${event.resourceType} ${event.type}: ${event.resourceId}`);
}
```

## Documentation

Full documentation is available at the [docs site](https://cesarandreslopez.github.io/sidekick-docker/).

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](../CONTRIBUTING.md) for setup instructions and guidelines.

## License

[MIT](../LICENSE)
