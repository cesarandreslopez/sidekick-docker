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
// non-streaming reads time out after requestTimeoutMs (default 30s; streams are exempt):
const client = new DockerClient({ socketPath: '/var/run/docker.sock', requestTimeoutMs: 10_000 });
```

A read that outlives its deadline rejects with `DockerTimeoutError`.

## Container Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `ping` | `() => Promise<boolean>` | Check Docker daemon connectivity |
| `pingDetailed` | `() => Promise<PingResult>` | Like `ping()`, but preserves the underlying error so callers can explain the failure |
| `listContainers` | `(all?: boolean, signal?: AbortSignal) => Promise<ContainerInfo[]>` | List containers (default: all including stopped) |
| `listResources` | `(opts?: ListResourcesOptions) => Promise<ResourceListing>` | One refresh pass: containers plus (unless disabled with `images`/`volumes`/`networks: false`) images, volumes and networks, from a **single** container listing. Each list settles independently (`PromiseSettledResult`) |
| `startContainer` | `(id: string) => Promise<void>` | Start a container |
| `stopContainer` | `(id: string) => Promise<void>` | Stop a container |
| `restartContainer` | `(id: string) => Promise<void>` | Restart a container |
| `pauseContainer` | `(id: string) => Promise<void>` | Pause a running container |
| `unpauseContainer` | `(id: string) => Promise<void>` | Unpause a paused container |
| `removeContainer` | `(id: string, force?: boolean) => Promise<void>` | Remove a container |
| `inspectContainer` | `(id: string) => Promise<ContainerInspectInfo>` | Get full container details |
| `getContainerEnv` | `(id: string) => Promise<string[]>` | Get container environment variables |
| `getContainerDetails` | `(id: string) => Promise<ContainerDetails>` | One inspect call, validated: env, restart policy and restart count, mounts, exit code, OOM flag, daemon error, and health (status, failing streak, last probes) |
| `pruneContainers` | `() => Promise<{ containersDeleted: string[]; spaceReclaimed: number }>` | Remove all stopped containers |
| `sampleStats` | `(id: string) => Promise<ContainerStats>` | One-shot stats reading; the non-streaming counterpart to `streamStats`, used to fill list-wide sorting |
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
| `pruneVolumes` | `() => Promise<{ spaceReclaimed: number }>` | Remove unused volumes — on Engine 23+ only anonymous ones (see `VolumeInfo.pruneScope`) |

## Network Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `listNetworks` | `() => Promise<NetworkInfo[]>` | List networks with connected containers |
| `removeNetwork` | `(id: string) => Promise<void>` | Remove a network |
| `pruneNetworks` | `() => Promise<{ networksDeleted: string[] }>` | Remove unused networks |

## System Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `diskUsage` | `() => Promise<DiskUsage>` | Aggregate disk usage (`docker system df`) across images, containers, volumes and build cache |

## Events

| Method | Signature | Description |
|--------|-----------|-------------|
| `streamEvents` | `(filters?: Record<string, string[]>, signal?: AbortSignal) => AsyncIterable<DockerEvent>` | Stream Docker daemon events |

All three streaming methods accept an optional abort signal that cancels pending requests as well as active streams. Decoding preserves split JSON records and UTF-8 characters; live logs distinguish TTY output from multiplexed stdout/stderr. See [Streaming Architecture](../architecture/streaming.md) for ownership and reconnection behavior.

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
