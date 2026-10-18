import { describe, expect, it } from 'vitest';
import { LogResumeCursor } from './LogResumeCursor';
import type { LogEntry } from '../types/container';

const entry = (iso: string | null, message: string): LogEntry => ({
  timestamp: iso ? new Date(iso) : null, stream: 'stdout', message,
});

describe('LogResumeCursor', () => {
  it('has no position until it observes a timestamped entry', () => {
    const c = new LogResumeCursor();
    c.observe(entry(null, 'no ts'));
    expect(c.sinceSeconds()).toBeUndefined();
    expect(c.isReplay(entry('2026-01-01T00:00:00.000Z', 'x'))).toBe(false);
  });

  it('reports the last timestamp as fractional seconds and RFC 3339', () => {
    const c = new LogResumeCursor();
    c.observe(entry('2026-01-01T00:00:01.250Z', 'a'));
    c.observe(entry('2026-01-01T00:00:00.000Z', 'older'));
    expect(c.sinceSeconds()).toBe(Date.parse('2026-01-01T00:00:01.250Z') / 1000);
    expect(c.sinceIso()).toBe('2026-01-01T00:00:01.250Z');
  });

  it('treats older entries and already-seen same-millisecond entries as replays', () => {
    const c = new LogResumeCursor();
    c.observe(entry('2026-01-01T00:00:01.000Z', 'first'));
    c.observe(entry('2026-01-01T00:00:01.000Z', 'second'));
    expect(c.isReplay(entry('2026-01-01T00:00:00.999Z', 'anything'))).toBe(true);
    expect(c.isReplay(entry('2026-01-01T00:00:01.000Z', 'second'))).toBe(true);
    expect(c.isReplay(entry('2026-01-01T00:00:01.000Z', 'third'))).toBe(false);
    expect(c.isReplay(entry('2026-01-01T00:00:01.001Z', 'first'))).toBe(false);
    expect(c.isReplay(entry(null, 'first'))).toBe(false);
  });

  it('forgets everything on reset', () => {
    const c = new LogResumeCursor();
    c.observe(entry('2026-01-01T00:00:01.000Z', 'a'));
    c.reset();
    expect(c.sinceIso()).toBeUndefined();
    expect(c.isReplay(entry('2026-01-01T00:00:00.000Z', 'a'))).toBe(false);
  });
});
