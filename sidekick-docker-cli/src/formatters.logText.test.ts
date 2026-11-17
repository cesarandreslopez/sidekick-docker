import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { LogEntry } from 'sidekick-docker-shared';
import { sanitizeLogText, stripSgr, logPlainText, colorizeLogEntry, renderLogLines, formatLogTemplate, setColorEnabled, STDERR_GUTTER } from './formatters';

beforeEach(() => setColorEnabled(true));
afterEach(() => setColorEnabled(true));

const entry = (message: string, stream: 'stdout' | 'stderr' = 'stdout'): LogEntry => ({ timestamp: null, stream, message });

describe('sanitizeLogText (T21)', () => {
  it('expands tabs to 8-column stops', () => {
    expect(sanitizeLogText('a\tb')).toBe('a       b');
    expect(sanitizeLogText('12345678\tx')).toBe('12345678        x');
    expect(sanitizeLogText('\t\tx')).toBe(' '.repeat(16) + 'x');
  });

  it('drops carriage returns, BEL and other C0/C1 controls (Missed-7: no beeps)', () => {
    expect(sanitizeLogText('done\r')).toBe('done');
    expect(sanitizeLogText('ding\x07dong')).toBe('dingdong');
    expect(sanitizeLogText('a\x00b\x08c\x7fd\u009be')).toBe('abcde');
  });

  it('removes cursor, erase, title and hyperlink sequences but keeps their text', () => {
    expect(sanitizeLogText('50%\x1b[2K\x1b[1G100%')).toBe('50%100%');
    expect(sanitizeLogText('\x1b]0;pwned\x07hello')).toBe('hello');
    expect(sanitizeLogText('see \x1b]8;;https://x.io\x1b\\docs\x1b]8;;\x1b\\ now')).toBe('see docs now');
    expect(sanitizeLogText('\x1b(Bplain\x1b7')).toBe('plain');
    expect(sanitizeLogText('lone \x1b')).toBe('lone ');
  });

  it('keeps colour (SGR) sequences, which do not count toward tab stops', () => {
    expect(sanitizeLogText('\x1b[32mINFO\x1b[0m\tready')).toBe('\x1b[32mINFO\x1b[0m    ready');
  });

  it('returns clean text unchanged', () => {
    const text = 'GET /health 200 — ok';
    expect(sanitizeLogText(text)).toBe(text);
  });
});

describe('stripSgr / logPlainText', () => {
  it('give the plain text the filter matches and Copy Logs copies', () => {
    expect(stripSgr('\x1b[1;31mERR\x1b[0m x')).toBe('ERR x');
    expect(logPlainText(entry('\x1b[33mWARN\x1b[0m\tdisk\x07'))).toBe('WARN    disk');
  });
});

describe('colorizeLogEntry', () => {
  it('a line the app coloured keeps its colours, and loses them with colour off', () => {
    const coloured = entry('\x1b[32mready\x1b[0m');
    expect(colorizeLogEntry(coloured)).toBe('\x1b[32mready\x1b[0m');
    setColorEnabled(false);
    expect(colorizeLogEntry(entry('\x1b[32mready\x1b[0m'))).toBe('ready');
  });

  it('marks stderr with a gutter and colours its tokens like stdout (T8)', () => {
    const line = colorizeLogEntry(entry('GET /x 500', 'stderr'));
    expect(stripSgr(line)).toBe(`${STDERR_GUTTER}GET /x 500`);
    // Tokens are coloured: the status code gets its own colour, not one red run.
    expect(line).toContain('\x1b[31m500');
    setColorEnabled(false);
    expect(colorizeLogEntry(entry('boom', 'stderr'))).toBe(`${STDERR_GUTTER}boom`);
  });

  it('never emits the control characters it was given', () => {
    const line = colorizeLogEntry(entry('a\rb\x07c\x1b[2Kd'));
    expect(line).not.toMatch(/[\r\x07]|\x1b\[2K/);
  });
});

describe('renderLogLines filters the sanitised text', () => {
  it('matches across colour codes and highlights at the right offsets', () => {
    setColorEnabled(false);
    const logs = [entry('\x1b[31mERR\x1b[0mOR db down'), entry('fine')];
    const lines = renderLogLines(logs, 'ERROR', 'exact');
    expect(lines).toEqual(['1 matches (exact) — f to edit the filter', 'ERROR db down']);
  });

  it('a tab in the message does not stop a filter on the expanded text', () => {
    setColorEnabled(false);
    const lines = renderLogLines([entry('key:\tvalue')], 'key:    value', 'exact');
    expect(lines.at(-1)).toBe('key:    value');
  });
});

describe('formatLogTemplate', () => {
  it('sanitises the mined pattern', () => {
    setColorEnabled(false);
    expect(formatLogTemplate({ count: 2, pattern: 'GET\t<*>\x07' })).toBe('    2  GET     <*>');
  });
});

describe('log timestamps option (T12)', () => {
  it('drops the time without disturbing the cached timed lines', () => {
    setColorEnabled(false);
    const timed: LogEntry = { timestamp: '2026-01-02T03:04:05.000Z', stream: 'stdout', message: 'ready' };
    const withTime = renderLogLines([timed], '', 'exact');
    expect(withTime[0]).toMatch(/^\d\d:\d\d:\d\d\.\d{3} ready$/);
    expect(renderLogLines([timed], '', 'exact', null, { timestamps: false })).toEqual(['ready']);
    expect(renderLogLines([timed], '', 'exact')).toEqual(withTime);
    expect(renderLogLines([timed], 'rea', 'exact', null, { timestamps: false }).at(-1)).toBe('ready');
  });
});
