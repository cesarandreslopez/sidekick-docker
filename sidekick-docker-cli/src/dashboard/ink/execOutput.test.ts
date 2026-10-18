import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appendExecOutput, ExecOutputBuffer, isDetachKey } from './execOutput';

describe('appendExecOutput', () => {
  it('continues the unterminated last line and starts new ones after newlines', () => {
    expect(appendExecOutput([], 'a')).toEqual(['a']);
    expect(appendExecOutput(['$ ec'], 'ho hi\nhi\n$ ')).toEqual(['$ echo hi', 'hi', '$ ']);
  });

  it('caps the scrollback and never mutates its input', () => {
    const input = ['1', '2'];
    expect(appendExecOutput(input, '\n3\n4', 3)).toEqual(['2', '3', '4']);
    expect(input).toEqual(['1', '2']);
  });
});

describe('ExecOutputBuffer', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('delivers many chunks as one flush per interval', () => {
    const flushed: string[] = [];
    const buf = new ExecOutputBuffer(d => flushed.push(d), 50);
    for (let i = 0; i < 1000; i++) buf.push('x');
    expect(flushed).toEqual([]);
    vi.advanceTimersByTime(50);
    expect(flushed).toEqual(['x'.repeat(1000)]);
  });

  it('flushes immediately on demand and drops pending output on clear', () => {
    const flushed: string[] = [];
    const buf = new ExecOutputBuffer(d => flushed.push(d), 50);
    buf.push('a');
    buf.flush();
    buf.push('b');
    buf.clear();
    vi.advanceTimersByTime(100);
    expect(flushed).toEqual(['a']);
  });
});

describe('isDetachKey', () => {
  it('recognises Ctrl+] whether stdin delivers a string or a Buffer', () => {
    expect(isDetachKey('\x1d')).toBe(true);
    expect(isDetachKey(Buffer.from([0x1d]))).toBe(true);
    expect(isDetachKey('a')).toBe(false);
    expect(isDetachKey('\x1dx')).toBe(false);
  });
});

