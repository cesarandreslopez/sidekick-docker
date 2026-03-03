import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LogStreamManager } from './LogStreamManager';
import type { DockerClient } from 'sidekick-docker-shared';

function makeEntry(message: string, stream: 'stdout' | 'stderr' = 'stdout') {
  return { timestamp: new Date(), stream, message };
}

describe('LogStreamManager', () => {
  let manager: LogStreamManager;
  let onChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    onChange = vi.fn();
  });

  afterEach(() => {
    manager?.dispose();
    vi.useRealTimers();
  });

  it('starts streaming when container selected', async () => {
    const entries = [makeEntry('line 1'), makeEntry('line 2')];
    const client = {
      streamLogs: vi.fn().mockReturnValue((async function* () {
        for (const e of entries) yield e;
      })()),
    } as unknown as DockerClient;

    manager = new LogStreamManager(client, onChange);
    await manager.select('container-1');

    // Allow async generator to process
    await vi.advanceTimersByTimeAsync(0);

    expect(manager.getLogs()).toHaveLength(2);
    expect(manager.getLogs()[0].message).toBe('line 1');
    expect(onChange).toHaveBeenCalled();
  });

  it('clears logs when switching containers', async () => {
    const client = {
      streamLogs: vi.fn().mockReturnValue((async function* () {
        yield makeEntry('old log');
      })()),
    } as unknown as DockerClient;

    manager = new LogStreamManager(client, onChange);
    await manager.select('container-1');
    await vi.advanceTimersByTimeAsync(0);
    expect(manager.getLogs()).toHaveLength(1);

    // Mock a new stream for the second container
    (client.streamLogs as ReturnType<typeof vi.fn>).mockReturnValue((async function* () {
      yield makeEntry('new log');
    })());

    await manager.select('container-2');
    await vi.advanceTimersByTimeAsync(0);
    expect(manager.getLogs()).toHaveLength(1);
    expect(manager.getLogs()[0].message).toBe('new log');
  });

  it('stops streaming on dispose', async () => {
    const client = {
      streamLogs: vi.fn().mockReturnValue((async function* () {
        yield makeEntry('line 1');
      })()),
    } as unknown as DockerClient;

    manager = new LogStreamManager(client, onChange);
    await manager.select('container-1');
    await vi.advanceTimersByTimeAsync(0);

    manager.dispose();
    expect(manager.getCurrentContainerId()).toBeNull();
  });

  it('does not re-select same container', async () => {
    const client = {
      streamLogs: vi.fn().mockReturnValue((async function* () {
        yield makeEntry('line 1');
      })()),
    } as unknown as DockerClient;

    manager = new LogStreamManager(client, onChange);
    await manager.select('container-1');
    await vi.advanceTimersByTimeAsync(0);

    // Select same container again — should be no-op
    await manager.select('container-1');
    expect(client.streamLogs).toHaveBeenCalledTimes(1);
  });

  it('clears logs when selecting null', async () => {
    const client = {
      streamLogs: vi.fn().mockReturnValue((async function* () {
        yield makeEntry('line 1');
      })()),
    } as unknown as DockerClient;

    manager = new LogStreamManager(client, onChange);
    await manager.select('container-1');
    await vi.advanceTimersByTimeAsync(0);

    await manager.select(null);
    expect(manager.getLogs()).toHaveLength(0);
    expect(manager.getCurrentContainerId()).toBeNull();
  });

  it('tracks severity counts', async () => {
    const client = {
      streamLogs: vi.fn().mockReturnValue((async function* () {
        yield makeEntry('ERROR: something went wrong');
        yield makeEntry('WARN: careful');
        yield makeEntry('info message');
      })()),
    } as unknown as DockerClient;

    manager = new LogStreamManager(client, onChange);
    await manager.select('container-1');
    await vi.advanceTimersByTimeAsync(0);

    const counts = manager.getSeverityCounts();
    expect(counts.total).toBe(3);
  });
});
