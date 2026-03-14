import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ReconnectScheduler,
  INITIAL_RECONNECT_DELAY,
  MAX_RECONNECT_DELAY,
  MAX_RECONNECT_ATTEMPTS,
} from './reconnect';

describe('ReconnectScheduler', () => {
  let scheduler: ReconnectScheduler;

  beforeEach(() => {
    vi.useFakeTimers();
    scheduler = new ReconnectScheduler();
  });

  afterEach(() => {
    scheduler.clear();
    vi.useRealTimers();
  });

  it('schedules callback after initial delay', () => {
    const cb = vi.fn();
    const scheduled = scheduler.schedule(cb);

    expect(scheduled).toBe(true);
    expect(cb).not.toHaveBeenCalled();

    vi.advanceTimersByTime(INITIAL_RECONNECT_DELAY);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('uses exponential backoff on successive calls', () => {
    const cb = vi.fn();

    // First schedule — fires after INITIAL_RECONNECT_DELAY
    scheduler.schedule(cb);
    vi.advanceTimersByTime(INITIAL_RECONNECT_DELAY);
    expect(cb).toHaveBeenCalledTimes(1);

    // Second schedule — delay doubles
    scheduler.schedule(cb);
    vi.advanceTimersByTime(INITIAL_RECONNECT_DELAY * 2 - 1);
    expect(cb).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('caps delay at MAX_RECONNECT_DELAY', () => {
    const cb = vi.fn();

    // Burn through attempts until delay would exceed max
    for (let i = 0; i < 6; i++) {
      scheduler.schedule(cb);
      vi.advanceTimersByTime(MAX_RECONNECT_DELAY + 1);
    }

    // At this point the delay should be capped
    scheduler.schedule(cb);
    cb.mockClear();
    vi.advanceTimersByTime(MAX_RECONNECT_DELAY);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('returns false after MAX_RECONNECT_ATTEMPTS', () => {
    const cb = vi.fn();

    // Exhaust all attempts
    for (let i = 0; i < MAX_RECONNECT_ATTEMPTS; i++) {
      expect(scheduler.schedule(cb)).toBe(true);
      vi.advanceTimersByTime(MAX_RECONNECT_DELAY + 1);
    }

    // Next attempt should fail
    expect(scheduler.schedule(cb)).toBe(false);
    expect(cb).toHaveBeenCalledTimes(MAX_RECONNECT_ATTEMPTS);
  });

  it('reset() restores initial state', () => {
    const cb = vi.fn();

    // Use a few attempts
    for (let i = 0; i < 5; i++) {
      scheduler.schedule(cb);
      vi.advanceTimersByTime(MAX_RECONNECT_DELAY + 1);
    }

    scheduler.reset();

    // Should behave as fresh — schedule at initial delay
    cb.mockClear();
    scheduler.schedule(cb);
    vi.advanceTimersByTime(INITIAL_RECONNECT_DELAY);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('clear() cancels pending timer', () => {
    const cb = vi.fn();
    scheduler.schedule(cb);

    scheduler.clear();

    vi.advanceTimersByTime(MAX_RECONNECT_DELAY + 1);
    expect(cb).not.toHaveBeenCalled();
  });

  it('schedule() replaces previous pending timer', () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    scheduler.schedule(cb1);
    scheduler.schedule(cb2);

    vi.advanceTimersByTime(INITIAL_RECONNECT_DELAY);
    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).toHaveBeenCalledTimes(1);
  });

  it('exported constants have expected values', () => {
    expect(INITIAL_RECONNECT_DELAY).toBe(2000);
    expect(MAX_RECONNECT_DELAY).toBe(30_000);
    expect(MAX_RECONNECT_ATTEMPTS).toBe(10);
  });
});
