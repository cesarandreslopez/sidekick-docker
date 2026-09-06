# docker — Design Spec

## Purpose
Docker Engine API facade via dockerode. All Docker daemon communication flows through `DockerClient` — consumers never use dockerode directly.

## Public Interface

Exports from `sidekick-docker-shared/src/docker/`:

- `DockerClient` — Facade class wrapping dockerode with typed methods
- `DockerClientOptions` — Constructor options (socketPath, etc.)
- `LogStreamOptions` — Options for `streamLogs()` (follow, tail)

Key `DockerClient` methods:
- `ping()` — Connection health check
- `listContainers(all?)` — List containers with Zod validation
- `listImages()` — List images with Zod validation
- `listVolumes()` — List volumes with Zod validation
- `listNetworks()` — List networks
- `startContainer(id)`, `stopContainer(id)`, `restartContainer(id)`, etc.
- `removeContainer(id, force?)`, `removeImage(id)`, `removeVolume(name)`, `removeNetwork(id)`
- `pruneImages()`, `pruneVolumes()`, `pruneNetworks()`
- `streamLogs(id, opts?, signal?)` — AsyncIterable<LogEntry>; TTY-aware with separate stdout/stderr decoding
- `streamStats(id, signal?)` — AsyncIterable<ContainerStats>
- `streamEvents(filters?, signal?)` — AsyncIterable<DockerEvent>
- `getContainerEnv(id)` — Inspect container environment variables
- `dispose()` — Close connection

## Internal Structure

```
sidekick-docker-shared/src/docker/
├── DockerClient.ts       # Main facade class
├── DockerClient.test.ts  # Tests
├── streams.ts            # Abort ownership and incremental UTF-8/line decoding
├── streaming.test.ts     # Fragmentation and cancellation regression tests
└── schemas.ts            # Zod schemas for Docker API responses
```

## Dependencies

Streaming requests propagate abort signals while pending and after response acquisition. Incremental decoding preserves records across transport chunks, including final records without a newline, and stream cleanup removes abort listeners.

- **Allowed imports**: `types` (internal), `dockerode` (external), `zod` (external)
- **Forbidden imports**: `compose`, `log`, `events`, `stats`, `core` — DockerClient must not depend on higher-level modules

## Files to Move

| Source (current) | Destination (target) | Notes |
|-----------------|---------------------|-------|
| (all files stay in place) | — | No moves needed |

## Open Questions

- None — this module is already well-structured.
