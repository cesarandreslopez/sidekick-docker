# types — Design Spec

## Purpose
Pure type definitions for all Docker resource types. The foundation layer that every other module depends on.

## Public Interface

Exports from `sidekick-docker-shared/src/types/index.ts`:

**Container types:**
- `ContainerInfo` — Container metadata (id, name, image, state, ports, etc.)
- `ContainerStats` — CPU, memory, network, block I/O stats snapshot
- `ContainerStatsHistory` — Ring buffer of stats samples
- `LogEntry` — Single log line with timestamp, stream, message
- `PortBinding` — Host/container port mapping

**Resource types:**
- `ImageInfo` — Image metadata (id, tags, size, created)
- `VolumeInfo` — Volume metadata (name, driver, mountpoint)
- `NetworkInfo` — Network metadata (id, name, driver, containers)

**Compose types:**
- `ComposeProject` — Project with services and status
- `ComposeService` — Service within a project

**Event types:**
- `DockerEvent` — Docker daemon event (type, resource, attributes)
- `EventType` — Event type literals
- `ResourceType` — Resource type literals

## Internal Structure

```
sidekick-docker-shared/src/types/
├── container.ts    # ContainerInfo, ContainerStats, LogEntry, PortBinding
├── image.ts        # ImageInfo
├── volume.ts       # VolumeInfo
├── network.ts      # NetworkInfo
├── compose.ts      # ComposeProject, ComposeService
├── events.ts       # DockerEvent, EventType, ResourceType
└── index.ts        # Barrel re-export
```

## Dependencies

- **Allowed imports**: None (leaf module)
- **Forbidden imports**: Everything — this module must have zero internal dependencies

## Files to Move

| Source (current) | Destination (target) | Notes |
|-----------------|---------------------|-------|
| (all files stay in place) | — | No moves needed |

## Open Questions

- Should `LogEntry` move to the `log` module? Currently in `container.ts` because it's used by both log streaming and container display. Keeping it in types avoids a circular dependency between log and types.
