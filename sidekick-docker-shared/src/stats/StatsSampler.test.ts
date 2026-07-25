import { describe, it, expect, vi } from 'vitest';
import { StatsSampler } from './StatsSampler';
import type { ContainerStats } from '../types/container';

function makeStats(cpuPercent: number): ContainerStats {
  return {
    cpuPercent,
    memoryUsage: 0,
    memoryLimit: 0,
    memoryPercent: 0,
    networkRx: 0,
    networkTx: 0,
    blockRead: 0,
    blockWrite: 0,
    pids: 0,
    timestamp: new Date(0),
  };
}

/** Sampler with recording fakes; `intervalMs` is large so only explicit sweeps run. */
function makeSampler(overrides: { sample?: (id: string) => Promise<ContainerStats> } = {}) {
  const pushed: { id: string; stats: ContainerStats }[] = [];
  const onChange = vi.fn();
  const sample = overrides.sample ?? ((id: string) => Promise.resolve(makeStats(id.length)));
  const sampler = new StatsSampler({
    sample,
    push: (id, stats) => { pushed.push({ id, stats }); },
    onChange,
    intervalMs: 1_000_000,
  });
  return { sampler, pushed, onChange };
}

/**
 * `setIds` kicks off an immediate sweep on purpose, so sorting has data
 * without waiting a full interval. Let that settle before asserting.
 */
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

describe('StatsSampler', () => {
  it('samples every id it is given, not just one', async () => {
    // The bug this class exists to fix: sorting read stats for rows that were
    // never sampled, so every unselected container compared as zero.
    const { sampler, pushed } = makeSampler();
    sampler.setIds(['a', 'bb', 'ccc']);
    await sampler.sweep();

    expect(pushed.map(p => p.id).sort()).toEqual(['a', 'bb', 'ccc']);
    sampler.dispose();
  });

  it('reports a change once per sweep, not once per container', async () => {
    const { sampler, onChange } = makeSampler();
    sampler.setIds(['a', 'b', 'c']);
    await settle();
    onChange.mockClear();
    await sampler.sweep();

    expect(onChange).toHaveBeenCalledTimes(1);
    sampler.dispose();
  });

  it('keeps going when one container fails mid-sweep', async () => {
    // Containers stop between listing and sampling; that must not drop the rest.
    const { sampler, pushed } = makeSampler({
      sample: (id) => id === 'gone'
        ? Promise.reject(new Error('no such container'))
        : Promise.resolve(makeStats(1)),
    });
    sampler.setIds(['a', 'gone', 'b']);
    await sampler.sweep();

    expect(pushed.map(p => p.id).sort()).toEqual(['a', 'b']);
    sampler.dispose();
  });

  it('does not fire onChange when every sample failed', async () => {
    const { sampler, onChange } = makeSampler({
      sample: () => Promise.reject(new Error('daemon down')),
    });
    sampler.setIds(['a', 'b']);
    onChange.mockClear();
    await sampler.sweep();

    expect(onChange).not.toHaveBeenCalled();
    sampler.dispose();
  });

  it('stops sampling when given an empty list', async () => {
    const { sampler, pushed } = makeSampler();
    sampler.setIds(['a']);
    await settle();
    pushed.length = 0;
    sampler.setIds([]);
    await sampler.sweep();

    expect(pushed).toEqual([]);
    sampler.dispose();
  });

  it('samples nothing after dispose, including samples already in flight', async () => {
    const { sampler, pushed } = makeSampler();
    sampler.setIds(['a', 'b']);
    // Dispose mid-flight: the sweep from setIds has not resolved yet.
    sampler.dispose();
    pushed.length = 0;
    await settle();
    await sampler.sweep();

    expect(pushed).toEqual([]);
  });

  it('does not overlap sweeps', async () => {
    // A sweep slower than the interval must not stack up concurrent requests.
    let inFlight = 0;
    let maxInFlight = 0;
    const { sampler } = makeSampler({
      sample: async () => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await Promise.resolve();
        inFlight--;
        return makeStats(1);
      },
    });
    sampler.setIds(['a', 'b', 'c', 'd']);

    await Promise.all([sampler.sweep(), sampler.sweep(), sampler.sweep()]);

    // Bounded by MAX_CONCURRENT (8) and the 4 ids, never multiplied by 3 sweeps.
    expect(maxInFlight).toBeLessThanOrEqual(4);
    sampler.dispose();
  });

  it('caps concurrency below the number of containers', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const { sampler } = makeSampler({
      sample: async () => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await Promise.resolve();
        inFlight--;
        return makeStats(1);
      },
    });
    sampler.setIds(Array.from({ length: 40 }, (_, i) => `c${i}`));
    await sampler.sweep();

    expect(maxInFlight).toBeLessThanOrEqual(8);
    sampler.dispose();
  });
});
