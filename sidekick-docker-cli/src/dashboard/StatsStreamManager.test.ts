import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StatsStreamManager } from './StatsStreamManager';
import { StatsCollector } from 'sidekick-docker-shared';
import type { DockerClient, ContainerStats } from 'sidekick-docker-shared';

function makeStats(overrides: Partial<ContainerStats> = {}): ContainerStats {
  return {
    timestamp: new Date(),
    cpuPercent: 5.0,
    memoryUsage: 1024 * 1024 * 50,
    memoryLimit: 1024 * 1024 * 1024,
    memoryPercent: 5.0,
    networkRx: 1000,
    networkTx: 2000,
    pids: 10,
    ...overrides,
  };
}

describe('StatsStreamManager', () => {
  let manager: StatsStreamManager;
  let collector: StatsCollector;
  let onChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    collector = new StatsCollector();
    onChange = vi.fn();
  });

  afterEach(() => {
    manager?.dispose();
    vi.useRealTimers();
  });

  it('starts streaming when container selected', async () => {
    const stats = makeStats();
    const client = {
      streamStats: vi.fn().mockReturnValue((async function* () {
        yield stats;
      })()),
    } as unknown as DockerClient;

    manager = new StatsStreamManager(client, collector, onChange);
    await manager.select('container-1');

    await vi.advanceTimersByTimeAsync(0);

    expect(collector.getLatest('container-1')).toBeDefined();
    expect(collector.getLatest('container-1')!.cpuPercent).toBe(5.0);
    expect(onChange).toHaveBeenCalled();
  });

  it('stops streaming on dispose', async () => {
    const client = {
      streamStats: vi.fn().mockReturnValue((async function* () {
        yield makeStats();
      })()),
    } as unknown as DockerClient;

    manager = new StatsStreamManager(client, collector, onChange);
    await manager.select('container-1');
    await vi.advanceTimersByTimeAsync(0);

    manager.dispose();
    expect(manager.getCurrentContainerId()).toBeNull();
  });

  it('does not re-select same container', async () => {
    const client = {
      streamStats: vi.fn().mockReturnValue((async function* () {
        yield makeStats();
      })()),
    } as unknown as DockerClient;

    manager = new StatsStreamManager(client, collector, onChange);
    await manager.select('container-1');
    await vi.advanceTimersByTimeAsync(0);

    await manager.select('container-1');
    expect(client.streamStats).toHaveBeenCalledTimes(1);
  });

  it('clears state when selecting null', async () => {
    const client = {
      streamStats: vi.fn().mockReturnValue((async function* () {
        yield makeStats();
      })()),
    } as unknown as DockerClient;

    manager = new StatsStreamManager(client, collector, onChange);
    await manager.select('container-1');
    await vi.advanceTimersByTimeAsync(0);

    await manager.select(null);
    expect(manager.getCurrentContainerId()).toBeNull();
  });

  it('emits a single loading change before first stats arrive', async () => {
    let resolve: () => void;
    const delayedPromise = new Promise<void>(r => { resolve = r; });
    const client = {
      streamStats: vi.fn().mockReturnValue((async function* () {
        await delayedPromise;
        yield makeStats();
      })()),
    } as unknown as DockerClient;

    manager = new StatsStreamManager(client, collector, onChange);
    await manager.select('container-1');

    // onChange is called once to show the loading state
    expect(onChange).toHaveBeenCalledTimes(1);

    // Resolve the stream to deliver stats
    resolve!();
    await vi.advanceTimersByTimeAsync(0);

    expect(onChange.mock.calls.length).toBe(2);
  });
});
