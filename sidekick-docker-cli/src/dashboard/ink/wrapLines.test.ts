import { describe, expect, it } from 'vitest';
import stringWidth from 'string-width';
import { wrapDetailLines, wrapLine } from './wrapLines';

describe('wrapLine (T11)', () => {
  it('returns a line that fits as itself', () => {
    expect(wrapLine('short', 10)).toEqual(['short']);
  });

  it('breaks a long line into rows no wider than the pane', () => {
    const rows = wrapLine('the quick brown fox jumps over the lazy dog', 12);
    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows) expect(stringWidth(row)).toBeLessThanOrEqual(12);
    expect(rows.join(' ').replace(/\s+/g, ' ').trim()).toBe('the quick brown fox jumps over the lazy dog');
  });

  it('hard-breaks a word longer than the pane', () => {
    const rows = wrapLine('x'.repeat(25), 10);
    expect(rows).toEqual(['x'.repeat(10), 'x'.repeat(10), 'x'.repeat(5)]);
  });

  it('keeps the first row\'s indentation and drops only the break\'s space', () => {
    const rows = wrapLine('  Mounts: volume data → /var/lib/postgresql/data', 20);
    expect(rows[0].startsWith('  Mounts:')).toBe(true);
    for (const row of rows.slice(1)) expect(row.startsWith(' ')).toBe(false);
  });

  it('carries colour across the break and measures cells, not characters', () => {
    const rows = wrapLine('\x1b[31merror: something went wrong here\x1b[39m', 10);
    for (const row of rows) {
      expect(row).toContain('\x1b[31m');
      expect(stringWidth(row)).toBeLessThanOrEqual(10);
    }
    for (const row of wrapLine('日本語のログメッセージです', 8)) expect(stringWidth(row)).toBeLessThanOrEqual(8);
  });
});

describe('wrapDetailLines (T11)', () => {
  it('flattens wrapped rows in order, so scroll math counts drawn rows', () => {
    const out = wrapDetailLines(['a', 'b'.repeat(12), ''], 5);
    expect(out).toEqual(['a', 'bbbbb', 'bbbbb', 'bb', '']);
  });

  it('gives the same rows from its cache and after a width change', () => {
    const line = 'one two three four five six';
    expect(wrapDetailLines([line], 9)).toEqual(wrapDetailLines([line], 9));
    expect(wrapDetailLines([line], 30)).toEqual([line]);
  });

  it('never wraps to less than one cell', () => {
    expect(wrapDetailLines(['ab'], 0)).toEqual(['a', 'b']);
  });
});
