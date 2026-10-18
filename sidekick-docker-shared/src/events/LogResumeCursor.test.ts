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
    c.beginResume();
    expect(c.isReplay(entry('2026-01-01T00:00:00.000Z', 'x'))).toBe(false);
  });

  it('reports the last timestamp as fractional seconds and RFC 3339', () => {
    const c = new LogResumeCursor();
    c.observe(entry('2026-01-01T00:00:01.250Z', 'a'));
    c.observe(entry('2026-01-01T00:00:00.000Z', 'older'));
    expect(c.sinceSeconds()).toBe(Date.parse('2026-01-01T00:00:01.250Z') / 1000);
    expect(c.sinceIso()).toBe('2026-01-01T00:00:01.250Z');
  });

  it('never filters before a reconnect — an interleaved first backlog is kept whole', () => {
    const c = new LogResumeCursor();
    // Compose backlog: web's newest line first, then db's older ones.
    for (const e of [entry('2026-01-01T00:00:05.000Z', 'web | up'), entry('2026-01-01T00:00:01.000Z', 'db | init'), entry('2026-01-01T00:00:05.000Z', 'web | up')]) {
      expect(c.isReplay(e)).toBe(false);
      c.observe(e);
    }
  });

  it('on reconnect drops older entries and same-millisecond repeats only as often as seen', () => {
    const c = new LogResumeCursor();
    c.observe(entry('2026-01-01T00:00:01.000Z', 'retrying'));
    c.observe(entry('2026-01-01T00:00:01.000Z', 'retrying'));
    c.observe(entry('2026-01-01T00:00:01.000Z', 'other'));
    c.beginResume();
    expect(c.isReplay(entry('2026-01-01T00:00:00.999Z', 'anything'))).toBe(true);
    expect(c.isReplay(entry('2026-01-01T00:00:01.000Z', 'retrying'))).toBe(true);
    expect(c.isReplay(entry('2026-01-01T00:00:01.000Z', 'retrying'))).toBe(true);
    // A third same-millisecond "retrying" is new output, not a replay.
    expect(c.isReplay(entry('2026-01-01T00:00:01.000Z', 'retrying'))).toBe(false);
    expect(c.isReplay(entry('2026-01-01T00:00:01.001Z', 'other'))).toBe(false);
    expect(c.isReplay(entry(null, 'other'))).toBe(false);
  });

  it('forgets everything on reset', () => {
    const c = new LogResumeCursor();
    c.observe(entry('2026-01-01T00:00:01.000Z', 'a'));
    c.beginResume();
    c.reset();
    expect(c.sinceIso()).toBeUndefined();
    expect(c.isReplay(entry('2026-01-01T00:00:00.000Z', 'a'))).toBe(false);
  });
});
