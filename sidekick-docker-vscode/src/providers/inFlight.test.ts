import { describe, expect, it, vi } from 'vitest';
import { InFlightActions, alreadyRunningText } from './inFlight';

function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('InFlightActions', () => {
  it('ignores a second run of the same key while the first runs, and allows it again afterwards', async () => {
    const guard = new InFlightActions();
    const first = deferred();
    const fn = vi.fn(() => first.promise);
    const duplicate = vi.fn();

    const a = guard.run('stop:web', fn, duplicate);
    await guard.run('stop:web', fn, duplicate);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(duplicate).toHaveBeenCalledTimes(1);
    expect(guard.isRunning('stop:web')).toBe(true);

    first.resolve();
    await a;
    expect(guard.isRunning('stop:web')).toBe(false);
    await guard.run('stop:web', async () => { /* ok */ }, duplicate);
    expect(duplicate).toHaveBeenCalledTimes(1);
  });

  it('runs different keys side by side, and frees a key whose run failed', async () => {
    const guard = new InFlightActions();
    const stop = deferred();
    const ran: string[] = [];
    const a = guard.run('stop:web', () => { ran.push('stop'); return stop.promise; });
    await guard.run('start:db', async () => { ran.push('start'); });
    expect(ran).toEqual(['stop', 'start']);
    stop.reject(new Error('boom'));
    await expect(a).rejects.toThrow('boom');
    expect(guard.isRunning('stop:web')).toBe(false);
  });
});

describe('alreadyRunningText', () => {
  it('uses the shared progress wording', () => {
    expect(alreadyRunningText('stop', 'web')).toBe('Already stopping web…');
    expect(alreadyRunningText('up', 'shop')).toBe('Already bringing shop up…');
    expect(alreadyRunningText('openPort', 'web')).toBe('Already running openPort on web');
  });
});
