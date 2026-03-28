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
const collector = new StatsCollector(bufferSize?: number);
```

| Parameter | Default | Description |
|-----------|---------|-------------|
| `bufferSize` | `60` | Maximum number of samples to retain per container |

## Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `push` | `(id: string, stats: ContainerStats) => void` | Add a new stats sample for a container |
| `getCpuSeries` | `(id: string) => number[]` | Get array of CPU usage percentages |
| `getMemorySeries` | `(id: string) => number[]` | Get array of memory usage percentages |
| `getLatest` | `(id: string) => ContainerStats \| undefined` | Get the most recent stats sample |
| `getNetworkRxRateSeries` | `(id: string) => number[]` | Get network receive rate (bytes/sec) from consecutive sample deltas |
| `getNetworkTxRateSeries` | `(id: string) => number[]` | Get network transmit rate (bytes/sec) from consecutive sample deltas |
| `getBlockReadRateSeries` | `(id: string) => number[]` | Get block read rate (bytes/sec) from consecutive sample deltas |
| `getBlockWriteRateSeries` | `(id: string) => number[]` | Get block write rate (bytes/sec) from consecutive sample deltas |
| `prune` | `(activeContainerIds: Set<string>) => void` | Remove history entries for containers not in the active set |

## Ring Buffer

The collector uses a fixed-size ring buffer per container. Once the buffer is full, new samples overwrite the oldest ones. At the default buffer size of 60 and a sampling rate of ~1 sample/second, you get approximately 1 minute of history.

The resulting arrays are used to render sparkline charts in the dashboard Stats tab.

## Rate Series

The rate series methods (`getNetwork*RateSeries`, `getBlock*RateSeries`) compute per-second rates from consecutive cumulative samples. Since Docker reports network and block I/O as cumulative byte counts, these methods calculate the delta between each pair of consecutive samples divided by the elapsed time, giving you bytes/sec rates suitable for sparkline charts.
