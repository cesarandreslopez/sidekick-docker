import { describe, it, expect } from 'vitest';
import { exactMatch, fuzzyMatch, filterLine } from './LogFilter';

describe('LogFilter', () => {
  describe('exactMatch', () => {
    it('finds exact substring matches', () => {
      const result = exactMatch('hello world', 'world');
      expect(result.matched).toBe(true);
      expect(result.matches).toEqual([{ start: 6, length: 5 }]);
    });

    it('is case-insensitive', () => {
      const result = exactMatch('Hello World', 'hello');
      expect(result.matched).toBe(true);
      expect(result.matches[0].start).toBe(0);
    });

    it('finds multiple occurrences', () => {
      const result = exactMatch('foo bar foo baz foo', 'foo');
      expect(result.matched).toBe(true);
      expect(result.matches.length).toBe(3);
    });

    it('returns no match when query not found', () => {
      const result = exactMatch('hello world', 'xyz');
      expect(result.matched).toBe(false);
      expect(result.matches).toEqual([]);
    });

    it('returns matched=true with empty matches for empty query', () => {
      const result = exactMatch('hello', '');
      expect(result.matched).toBe(true);
      expect(result.matches).toEqual([]);
    });
  });

  describe('fuzzyMatch', () => {
    it('matches when all words appear in the line', () => {
      const result = fuzzyMatch('the quick brown fox', 'quick fox');
      expect(result.matched).toBe(true);
      expect(result.matches.length).toBe(2);
    });

    it('fails when any word is missing', () => {
      const result = fuzzyMatch('the quick brown fox', 'quick cat');
      expect(result.matched).toBe(false);
    });

    it('is case-insensitive', () => {
      const result = fuzzyMatch('Hello World', 'HELLO world');
      expect(result.matched).toBe(true);
    });

    it('returns matches sorted by position', () => {
      const result = fuzzyMatch('aaa bbb ccc', 'ccc aaa');
      expect(result.matched).toBe(true);
      expect(result.matches[0].start).toBeLessThan(result.matches[1].start);
    });

    it('handles empty query', () => {
      const result = fuzzyMatch('hello', '');
      expect(result.matched).toBe(true);
    });
  });

  describe('filterLine', () => {
    it('delegates to exact match', () => {
      const result = filterLine('hello world', 'world', 'exact');
      expect(result.matched).toBe(true);
    });

    it('delegates to fuzzy match', () => {
      const result = filterLine('hello world', 'world hello', 'fuzzy');
      expect(result.matched).toBe(true);
    });
  });
});
