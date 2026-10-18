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

  it('does not reconnect or duplicate the tail for a stopped container', async () => {
    const tail = [makeEntry('a'), makeEntry('b')];
    const client = {
      streamLogs: vi.fn(() => (async function* () { yield* tail; })()),
    } as unknown as DockerClient;
    manager = new LogStreamManager(client, onChange, { isTargetRunning: () => false });
    await manager.select('stopped');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(client.streamLogs).toHaveBeenCalledTimes(1);
    expect(manager.getLogs().map(l => l.message)).toEqual(['a', 'b']);
    expect(manager.getStreamState()).toBe('ended');
  });

  it('resumes with since when the container starts again, without duplicates', async () => {
    let running = false;
    const t1 = new Date('2026-01-01T00:00:01.000Z');
    const t2 = new Date('2026-01-01T00:00:02.000Z');
    const streamLogs = vi.fn()
      .mockImplementationOnce(() => (async function* () {
        yield { timestamp: t1, stream: 'stdout', message: 'before stop' };
      })())
      .mockImplementationOnce(() => (async function* () {
        // The daemon replays from `since` (same millisecond) before new output.
        yield { timestamp: t1, stream: 'stdout', message: 'before stop' };
        yield { timestamp: t2, stream: 'stdout', message: 'after start' };
      })());
    const client = { streamLogs } as unknown as DockerClient;
    manager = new LogStreamManager(client, onChange, { isTargetRunning: () => running });
    await manager.select('c1');
    await vi.advanceTimersByTimeAsync(0);
    expect(manager.getStreamState()).toBe('ended');

    running = true;
    manager.targetStateChanged();
    await vi.advanceTimersByTimeAsync(0);
    expect(streamLogs).toHaveBeenLastCalledWith('c1', expect.objectContaining({ since: t1.getTime() / 1000 }), expect.anything());
    expect(manager.getLogs().map(l => l.message)).toEqual(['before stop', 'after start']);
  });
});
