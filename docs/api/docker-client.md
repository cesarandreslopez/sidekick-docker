# DockerClient

The main facade for all Docker operations. All methods return typed results — never raw dockerode objects.

## Constructor

```typescript
import { DockerClient, parseDockerEndpoint } from 'sidekick-docker-shared';

const client = new DockerClient();
// or with options:
const client = new DockerClient({ socketPath: '/var/run/docker.sock' });
const client = new DockerClient({ host: '192.168.1.100', port: 2375 });
const client = new DockerClient({ host: '192.168.1.100', port: 2376, protocol: 'https' });
// or parse a user-supplied endpoint (bare socket path, unix:// URL, or tcp://host[:port] URL):
const client = new DockerClient(parseDockerEndpoint('tcp://192.168.1.100:2376'));
```

## Container Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `ping` | `() => Promise<boolean>` | Check Docker daemon connectivity |
| `pingDetailed` | `() => Promise<PingResult>` | Like `ping()`, but preserves the underlying error so callers can explain the failure |
| `listContainers` | `(all?: boolean) => Promise<ContainerInfo[]>` | List containers (default: all including stopped) |
| `startContainer` | `(id: string) => Promise<void>` | Start a container |
| `stopContainer` | `(id: string) => Promise<void>` | Stop a container |
| `restartContainer` | `(id: string) => Promise<void>` | Restart a container |
| `pauseContainer` | `(id: string) => Promise<void>` | Pause a running container |
| `unpauseContainer` | `(id: string) => Promise<void>` | Unpause a paused container |
| `removeContainer` | `(id: string, force?: boolean) => Promise<void>` | Remove a container |
| `inspectContainer` | `(id: string) => Promise<ContainerInspectInfo>` | Get full container details |
| `getContainerEnv` | `(id: string) => Promise<string[]>` | Get container environment variables |
| `getContainerChanges` | `(id: string) => Promise<FilesystemChange[]>` | Get filesystem changes vs base image |
| `streamLogs` | `(id: string, opts?: LogStreamOptions, signal?: AbortSignal) => AsyncIterable<LogEntry>` | Stream container logs |
| `streamStats` | `(id: string, signal?: AbortSignal) => AsyncIterable<ContainerStats>` | Stream live container stats |

## Image Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `listImages` | `(all?: boolean) => Promise<ImageInfo[]>` | List images |
| `getImageHistory` | `(nameOrId: string) => Promise<ImageLayer[]>` | Get image layer history |
| `removeImage` | `(id: string) => Promise<void>` | Remove an image |
| `pruneImages` | `() => Promise<{ spaceReclaimed: number }>` | Remove dangling images |

## Volume Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `listVolumes` | `() => Promise<VolumeInfo[]>` | List volumes (includes usage detection) |
| `removeVolume` | `(name: string) => Promise<void>` | Remove a volume |
| `pruneVolumes` | `() => Promise<{ spaceReclaimed: number }>` | Remove unused volumes |

## Network Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `listNetworks` | `() => Promise<NetworkInfo[]>` | List networks with connected containers |
| `removeNetwork` | `(id: string) => Promise<void>` | Remove a network |
| `pruneNetworks` | `() => Promise<{ networksDeleted: string[] }>` | Remove unused networks |

## Events

| Method | Signature | Description |
|--------|-----------|-------------|
| `streamEvents` | `(filters?: Record<string, string[]>, signal?: AbortSignal) => AsyncIterable<DockerEvent>` | Stream Docker daemon events |

## Usage Examples

### List all running containers

```typescript
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
