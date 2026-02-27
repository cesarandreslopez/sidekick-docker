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

  remove(containerId: string): void {
    this.histories.delete(containerId);
  }

  clear(): void {
    this.histories.clear();
  }
}
