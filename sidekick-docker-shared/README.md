# Sidekick Docker Shared

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/cesarandreslopez/sidekick-docker/blob/main/LICENSE)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/cesarandreslopez/sidekick-docker)

The Docker API abstraction layer that powers Sidekick Docker. Wraps dockerode into a typed, opinionated facade with async generators for streaming, Compose detection, and stats collection.

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
```

#### Container Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `ping` | `() => Promise<boolean>` | Check Docker daemon connectivity |
| `listContainers` | `(all?: boolean) => Promise<ContainerInfo[]>` | List containers (default: all including stopped) |
| `startContainer` | `(id: string) => Promise<void>` | Start a container |
| `stopContainer` | `(id: string) => Promise<void>` | Stop a container |
| `restartContainer` | `(id: string) => Promise<void>` | Restart a container |
| `removeContainer` | `(id: string, force?: boolean) => Promise<void>` | Remove a container |
| `inspectContainer` | `(id: string) => Promise<ContainerInspectInfo>` | Get full container details |
| `getContainerEnv` | `(id: string) => Promise<string[]>` | Get container environment variables |
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

#### Events

| Method | Signature | Description |
|--------|-----------|-------------|
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

`compose.streamLogs(project, service?, tail = 100, signal?)` returns an `AsyncIterable<LogEntry>`. It preserves split UTF-8 and final unterminated lines, throws on command failure, and terminates its subprocess on cancellation. See the [Compose API reference](https://cesarandreslopez.github.io/sidekick-docker/api/compose-detector/) for examples.

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

## Types

All types are exported from the package root.

```typescript
import type {
  ContainerInfo,
  ContainerStats,
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
