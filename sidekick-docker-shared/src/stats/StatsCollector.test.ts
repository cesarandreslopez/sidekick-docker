import { describe, it, expect } from 'vitest';
import { StatsCollector } from './StatsCollector';
import type { ContainerStats } from '../types/container';

function makeStats(cpuPercent: number, memoryPercent: number): ContainerStats {
  return {
    cpuPercent,
    memoryUsage: memoryPercent * 1024 * 1024,
    memoryLimit: 100 * 1024 * 1024,
    memoryPercent,
    networkRx: 0,
    networkTx: 0,
    pids: 1,
    timestamp: new Date(),
  };
}

describe('StatsCollector', () => {
  it('stores and retrieves stats', () => {
    const collector = new StatsCollector();
    collector.push('c1', makeStats(10, 20));
    collector.push('c1', makeStats(15, 25));

    const history = collector.getHistory('c1');
    expect(history).toBeDefined();
    expect(history!.samples).toHaveLength(2);
  });

  it('returns CPU and memory series', () => {
    const collector = new StatsCollector();
    collector.push('c1', makeStats(10, 20));
    collector.push('c1', makeStats(15, 25));
    collector.push('c1', makeStats(20, 30));

    expect(collector.getCpuSeries('c1')).toEqual([10, 15, 20]);
    expect(collector.getMemorySeries('c1')).toEqual([20, 25, 30]);
  });

  it('respects max samples ring buffer', () => {
    const collector = new StatsCollector(3);
    collector.push('c1', makeStats(1, 1));
    collector.push('c1', makeStats(2, 2));
    collector.push('c1', makeStats(3, 3));
    collector.push('c1', makeStats(4, 4));

    const history = collector.getHistory('c1');
    expect(history!.samples).toHaveLength(3);
    expect(collector.getCpuSeries('c1')).toEqual([2, 3, 4]);
  });

  it('returns latest stats', () => {
    const collector = new StatsCollector();
    collector.push('c1', makeStats(10, 20));
    collector.push('c1', makeStats(50, 60));

    const latest = collector.getLatest('c1');
    expect(latest!.cpuPercent).toBe(50);
  });

  it('returns undefined for unknown container', () => {
    const collector = new StatsCollector();
    expect(collector.getHistory('unknown')).toBeUndefined();
    expect(collector.getLatest('unknown')).toBeUndefined();
    expect(collector.getCpuSeries('unknown')).toEqual([]);
  });

  it('can remove and clear', () => {
    const collector = new StatsCollector();
    collector.push('c1', makeStats(10, 20));
    collector.push('c2', makeStats(30, 40));

    collector.remove('c1');
    expect(collector.getHistory('c1')).toBeUndefined();
    expect(collector.getHistory('c2')).toBeDefined();

    collector.clear();
    expect(collector.getHistory('c2')).toBeUndefined();
  });
});
