import type { ContainerStats, ContainerStatsHistory } from '../types/container';

const DEFAULT_MAX_SAMPLES = 60;

/**
 * Per-container ring buffer for stats history.
 * Stores the last N samples and provides derived data for charting.
 */
export class StatsCollector {
  private histories = new Map<string, ContainerStatsHistory>();
  private maxSamples: number;

  constructor(maxSamples = DEFAULT_MAX_SAMPLES) {
    this.maxSamples = maxSamples;
  }

  push(containerId: string, stats: ContainerStats): void {
    let history = this.histories.get(containerId);
    if (!history) {
      history = { containerId, samples: [], maxSamples: this.maxSamples };
      this.histories.set(containerId, history);
    }

    history.samples.push(stats);
    if (history.samples.length > this.maxSamples) {
      history.samples.shift();
    }
  }

  getHistory(containerId: string): ContainerStatsHistory | undefined {
    return this.histories.get(containerId);
  }

  getCpuSeries(containerId: string): number[] {
    const history = this.histories.get(containerId);
    if (!history) return [];
    return history.samples.map(s => s.cpuPercent);
  }

  getMemorySeries(containerId: string): number[] {
    const history = this.histories.get(containerId);
    if (!history) return [];
    return history.samples.map(s => s.memoryPercent);
  }

  getLatest(containerId: string): ContainerStats | undefined {
    const history = this.histories.get(containerId);
    if (!history || history.samples.length === 0) return undefined;
    return history.samples[history.samples.length - 1];
  }

  getNetworkRxRateSeries(containerId: string): number[] {
    return this.computeRateSeries(containerId, s => s.networkRx);
  }

  getNetworkTxRateSeries(containerId: string): number[] {
    return this.computeRateSeries(containerId, s => s.networkTx);
  }

  getBlockReadRateSeries(containerId: string): number[] {
    return this.computeRateSeries(containerId, s => s.blockRead);
  }

  getBlockWriteRateSeries(containerId: string): number[] {
    return this.computeRateSeries(containerId, s => s.blockWrite);
  }

  private computeRateSeries(containerId: string, extractor: (s: ContainerStats) => number): number[] {
    const history = this.histories.get(containerId);
    if (!history || history.samples.length < 2) return [];
    const rates: number[] = [];
    for (let i = 1; i < history.samples.length; i++) {
      const prev = history.samples[i - 1];
      const curr = history.samples[i];
      const dt = (curr.timestamp.getTime() - prev.timestamp.getTime()) / 1000;
      if (dt > 0) {
        const delta = extractor(curr) - extractor(prev);
        rates.push(Math.max(0, delta / dt));
      } else {
        rates.push(0);
      }
    }
    return rates;
  }

  remove(containerId: string): void {
    this.histories.delete(containerId);
  }

  clear(): void {
    this.histories.clear();
  }
}
