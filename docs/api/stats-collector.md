# StatsCollector

Per-container ring buffer for stats history. Provides derived time-series data for charting.

## Usage

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

## Constructor

```typescript
const collector = new StatsCollector(maxSamples?: number);
```

| Parameter | Default | Description |
|-----------|---------|-------------|
| `maxSamples` | `60` | Maximum number of samples to retain per container |

## Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `push` | `(id: string, stats: ContainerStats) => void` | Add a new stats sample for a container |
| `getHistory` | `(id: string) => ContainerStatsHistory \| undefined` | The raw history (`containerId`, `samples`, `maxSamples`) |
| `getCpuSeries` | `(id: string) => number[]` | Get array of CPU usage percentages |
| `getMemorySeries` | `(id: string) => number[]` | Get array of memory usage percentages |
| `getLatest` | `(id: string) => ContainerStats \| undefined` | Get the most recent stats sample |
| `getNetworkRxRateSeries` | `(id: string) => number[]` | Get network receive rate (bytes/sec) from consecutive sample deltas |
| `getNetworkTxRateSeries` | `(id: string) => number[]` | Get network transmit rate (bytes/sec) from consecutive sample deltas |
| `getBlockReadRateSeries` | `(id: string) => number[]` | Get block read rate (bytes/sec) from consecutive sample deltas |
| `getBlockWriteRateSeries` | `(id: string) => number[]` | Get block write rate (bytes/sec) from consecutive sample deltas |
| `prune` | `(activeContainerIds: Set<string>) => void` | Remove history entries for containers not in the active set |
| `remove` | `(id: string) => void` | Drop one container's history |
| `clear` | `() => void` | Drop all history |

## Ring Buffer

The collector uses a fixed-size ring buffer per container. Once the buffer is full, each new sample evicts the oldest one. A live stats stream delivers about one sample per second, so the default 60 samples hold roughly a minute. In both dashboards, sorting by a stats field also runs `StatsSampler`, which pushes a sample every 3 s for every running container — so rows that are not streamed hold about three minutes, and the selected container's buffer mixes both sources.

The resulting arrays are used to render sparkline charts in the dashboard Stats tab.

## Rate Series

The rate series methods (`getNetwork*RateSeries`, `getBlock*RateSeries`) compute per-second rates from consecutive cumulative samples. Since Docker reports network and block I/O as cumulative byte counts, these methods calculate the delta between each pair of consecutive samples divided by the elapsed time, giving you bytes/sec rates suitable for sparkline charts. With fewer than two samples they return an empty array; a negative delta (a counter reset, e.g. after a restart) clamps to 0, as does a pair with no elapsed time.
