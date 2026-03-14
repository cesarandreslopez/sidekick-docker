# stats — Design Spec

## Purpose
Container resource usage stats collection with ring buffer history. Collects CPU, memory, network, and block I/O samples for sparkline visualization.

## Public Interface

Exports from `sidekick-docker-shared/src/stats/`:

- `StatsCollector` — Manages per-container stats ring buffers
  - `push(containerId, stats)` — Add a stats sample
  - `remove(containerId)` — Remove container's history
  - `getCpuSeries(containerId)` → number[] — CPU percentage history
  - `getMemorySeries(containerId)` → number[] — Memory usage history
  - `getLatest(containerId)` → ContainerStats | undefined

## Internal Structure

```
sidekick-docker-shared/src/stats/
├── StatsCollector.ts       # Ring buffer stats manager
└── StatsCollector.test.ts  # Tests
```

## Dependencies

- **Allowed imports**: `types` (ContainerStats, ContainerStatsHistory)
- **Forbidden imports**: `docker`, `compose`, `log`, `events`, `core`

## Files to Move

| Source (current) | Destination (target) | Notes |
|-----------------|---------------------|-------|
| (all files stay in place) | — | No moves needed |

## Open Questions

- None — this module is already well-structured.
