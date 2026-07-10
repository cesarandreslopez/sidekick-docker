import { describe, it, expect } from 'vitest';
import { InvalidArgumentError } from 'commander';
import { parseTail } from './parseTail';

describe('parseTail', () => {
  it('parses non-negative integers', () => {
    expect(parseTail('0')).toBe(0);
    expect(parseTail('100')).toBe(100);
    expect(parseTail('99999')).toBe(99999);
  });

  it('rejects non-numeric input', () => {
    expect(() => parseTail('abc')).toThrow(InvalidArgumentError);
    expect(() => parseTail('abc')).toThrow('Expected a non-negative integer.');
  });

  it('rejects negative numbers, floats, and mixed strings', () => {
    expect(() => parseTail('-5')).toThrow(InvalidArgumentError);
    expect(() => parseTail('1.5')).toThrow(InvalidArgumentError);
    expect(() => parseTail('10x')).toThrow(InvalidArgumentError);
    expect(() => parseTail('')).toThrow(InvalidArgumentError);
  });
});
