import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FollowStream } from './FollowStream';
import type { FollowStreamState } from './FollowStream';
import { MAX_RECONNECT_ATTEMPTS } from './reconnect';

/** A source that yields the given batches, one batch per open() call, then ends. */
function batches<T>(...perAttempt: (T[] | Error)[]) {
  const calls: { reconnect: boolean }[] = [];
  const open = vi.fn((_signal: AbortSignal, attempt: { reconnect: boolean }) => {
    calls.push(attempt);
    const batch = perAttempt[Math.min(calls.length - 1, perAttempt.length - 1)];
    return (async function* () {
      await Promise.resolve();
      if (batch instanceof Error) throw batch;
      yield* batch;
    })();
  });
  return { open, calls };
}

const flush = () => vi.advanceTimersByTimeAsync(0);

describe('FollowStream', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  function make<T>(open: (s: AbortSignal, a: { reconnect: boolean }) => AsyncIterable<T>, opts: { running?: () => boolean | undefined; accept?: (i: T) => boolean } = {}) {
    const items: T[] = [];
    const states: FollowStreamState[] = [];
    const stream = new FollowStream<T>({
      open,
      onItem: i => items.push(i),
      onState: s => states.push(s),
      isTargetRunning: opts.running,
      accept: opts.accept,
    });
    return { stream, items, states };
  }

  it('ends without reconnecting when the source finishes and the target is stopped', async () => {
    const src = batches(['a', 'b']);
    const { stream, items, states } = make(src.open, { running: () => false });
    stream.start();
    await flush();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(items).toEqual(['a', 'b']);
    expect(src.open).toHaveBeenCalledTimes(1);
    expect(stream.state).toBe('ended');
    expect(states).toEqual(['loading', 'live', 'ended']);
  });

  it('reports empty when a stopped target produced nothing', async () => {
    const { stream } = make(batches<string>([]).open, { running: () => false });
    stream.start();
    await flush();
    expect(stream.state).toBe('empty');
  });

  it('reconnects a running target and tells open() it is a reconnect', async () => {
    const src = batches(['a'], ['b']);
    const { stream, items } = make(src.open, { running: () => true });
    stream.start();
    await flush();
    expect(stream.state).toBe('reconnecting');
    await vi.advanceTimersByTimeAsync(2000);
    expect(items).toEqual(['a', 'b']);
    expect(src.calls).toEqual([{ reconnect: false }, { reconnect: true }]);
    stream.stop();
  });

  it('gives up when attempts keep producing nothing new', async () => {
    const src = batches(['a'], []);
    const { stream } = make(src.open);
    stream.start();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(src.open).toHaveBeenCalledTimes(MAX_RECONNECT_ATTEMPTS + 1);
    expect(stream.state).toBe('error');
  });

  it('does not let replayed items reset the backoff', async () => {
    const src = batches(['a'], ['a']);
    const { stream, items } = make(src.open, { accept: i => !items.includes(i) });
    stream.start();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(items).toEqual(['a']);
    expect(stream.state).toBe('error');
  });

  it('reconnects after an error even when the target is stopped', async () => {
    const src = batches(new Error('socket hang up'), ['b']);
    const { stream, items } = make(src.open, { running: () => false });
    stream.start();
    await flush();
    expect(stream.state).toBe('reconnecting');
    await vi.advanceTimersByTimeAsync(2000);
    expect(items).toEqual(['b']);
    expect(stream.state).toBe('ended');
  });

  it('resume() restarts a finished stream only once the target runs again', async () => {
    let running = false;
    const src = batches(['a'], ['b']);
    const { stream, items } = make(src.open, { running: () => running });
    stream.start();
    await flush();
    stream.resume();
    await flush();
    expect(src.open).toHaveBeenCalledTimes(1);
    running = true;
    stream.resume();
    await flush();
    expect(items).toEqual(['a', 'b']);
    expect(src.calls[1]).toEqual({ reconnect: true });
    stream.stop();
  });

  it('stop() drops late items and cancels a pending reconnect', async () => {
    let release: () => void = () => {};
    const open = vi.fn(() => (async function* () {
      await new Promise<void>(r => { release = r; });
      yield 'late';
    })());
    const { stream, items } = make(open, { running: () => true });
    stream.start();
    await flush();
    stream.stop();
    release();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(items).toEqual([]);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('resume() leaves a backing-off or failed stream alone', async () => {
    const src = batches<string>(new Error('logging driver does not support reading'));
    const { stream } = make(src.open, { running: () => true });
    stream.start();
    await flush();
    expect(stream.state).toBe('reconnecting');
    for (let i = 0; i < 5; i++) stream.resume();
    await flush();
    expect(src.open).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(stream.state).toBe('error');
    stream.resume();
    await flush();
    expect(src.open).toHaveBeenCalledTimes(11);
  });
});

