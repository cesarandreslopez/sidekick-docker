import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ComposeLogStreamManager } from './ComposeLogStreamManager';
import type { ComposeClient, LogEntry } from 'sidekick-docker-shared';

const entry = (iso: string, message: string): LogEntry => ({ timestamp: new Date(iso), stream: 'stdout', message });

describe('ComposeLogStreamManager', () => {
  let manager: ComposeLogStreamManager;

  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { manager?.dispose(); vi.useRealTimers(); });

  it('ends for a stopped project instead of re-running docker compose logs', async () => {
    const streamLogs = vi.fn(() => (async function* () { yield entry('2026-01-01T00:00:00Z', 'web | hi'); })());
    manager = new ComposeLogStreamManager({ streamLogs } as unknown as ComposeClient, () => {}, { isTargetRunning: () => false });
    await manager.selectCompose('shop', null);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(streamLogs).toHaveBeenCalledTimes(1);
    expect(manager.getStreamState()).toBe('ended');
  });

  it('reconnects a running project with --since and drops the replayed line', async () => {
    const streamLogs = vi.fn()
      .mockImplementationOnce(() => (async function* () { yield entry('2026-01-01T00:00:01Z', 'web | one'); })())
      .mockImplementationOnce(() => (async function* () {
        yield entry('2026-01-01T00:00:01Z', 'web | one');
        yield entry('2026-01-01T00:00:02Z', 'web | two');
        await new Promise(() => {}); // stays open
      })());
    manager = new ComposeLogStreamManager({ streamLogs } as unknown as ComposeClient, () => {}, { isTargetRunning: () => true });
    await manager.selectCompose('shop', 'web');
    await vi.advanceTimersByTimeAsync(2000);
    expect(streamLogs).toHaveBeenLastCalledWith('shop', 'web', 1000, expect.anything(), '2026-01-01T00:00:01.000Z');
    expect(manager.getLogs().map(l => l.message)).toEqual(['web | one', 'web | two']);
  });
});
