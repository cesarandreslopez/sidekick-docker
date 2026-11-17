import { describe, expect, it } from 'vitest';
import { navigationRun, stripControlCharacters, tabRun } from './inputText';

describe('navigationRun (T22)', () => {
  it('moves by the length of an identical j or k run', () => {
    expect(navigationRun('jjjj')).toBe(4);
    expect(navigationRun('kk')).toBe(-2);
  });

  it('leaves single keys to their bindings', () => {
    expect(navigationRun('j')).toBe(0);
    expect(navigationRun('k')).toBe(0);
  });

  it('never splits a mixed paste into keys', () => {
    expect(navigationRun('jjk')).toBe(0);
    expect(navigationRun('jdj')).toBe(0);
    expect(navigationRun('JJ')).toBe(0);
    expect(navigationRun('')).toBe(0);
  });
});

describe('stripControlCharacters (T24)', () => {
  it('drops C0 controls and DEL, keeps printable text', () => {
    expect(stripControlCharacters('web\n')).toBe('web');
    expect(stripControlCharacters('a\tb\x07c\x7f')).toBe('abc');
    expect(stripControlCharacters('naïve · ok')).toBe('naïve · ok');
  });
});

describe('tabRun (T24)', () => {
  it('counts a chunk made only of tabs', () => {
    expect(tabRun('\t')).toBe(1);
    expect(tabRun('\t\t\t')).toBe(3);
    expect(tabRun('a\t')).toBe(0);
    expect(tabRun('')).toBe(0);
  });
});
