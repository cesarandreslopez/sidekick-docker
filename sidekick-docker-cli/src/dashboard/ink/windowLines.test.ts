import { describe, it, expect } from 'vitest';
import { windowLines, maxScrollOffset } from './windowLines';

const items = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

describe('windowLines', () => {
  it('uses the full budget when everything fits', () => {
    const w = windowLines(items(5), 0, 10);
    expect(w.visible).toHaveLength(5);
    expect(w.hasUp).toBe(false);
    expect(w.hasDown).toBe(false);
    expect(w.contentRows).toBe(5);
  });

  it('reserves one row for the down indicator at the top of a long list', () => {
    const w = windowLines(items(100), 0, 10);
    expect(w.hasUp).toBe(false);
    expect(w.hasDown).toBe(true);
    expect(w.visible).toHaveLength(9);
    // content rows + down indicator = viewportHeight
    expect(w.contentRows + 1).toBe(10);
    expect(w.below).toBe(91);
  });

  it('reserves two rows in the middle of a long list', () => {
    const w = windowLines(items(100), 50, 10);
    expect(w.hasUp).toBe(true);
    expect(w.hasDown).toBe(true);
    expect(w.visible).toHaveLength(8);
    expect(w.contentRows + 2).toBe(10);
    expect(w.above).toBe(50);
    expect(w.below).toBe(42);
  });

  it('reserves one row for the up indicator at the bottom', () => {
    const total = 100;
    const vh = 10;
    const offset = maxScrollOffset(total, vh);
    const w = windowLines(items(total), offset, vh);
    expect(w.hasUp).toBe(true);
    expect(w.hasDown).toBe(false);
    expect(w.visible).toHaveLength(vh - 1);
    expect(w.visible[w.visible.length - 1]).toBe(total - 1);
  });

  it('handles a viewport of 1', () => {
    const w = windowLines(items(10), 5, 1);
    expect(w.contentRows + (w.hasUp ? 1 : 0) + (w.hasDown ? 1 : 0)).toBeLessThanOrEqual(2);
    expect(w.visible.length).toBeLessThanOrEqual(1);
  });
});

describe('maxScrollOffset', () => {
  it('is zero when content fits', () => {
    expect(maxScrollOffset(5, 10)).toBe(0);
    expect(maxScrollOffset(10, 10)).toBe(0);
  });

  it('accounts for the up-indicator row', () => {
    // 100 lines, 10 rows: bottom shows ▲ + 9 lines.
    expect(maxScrollOffset(100, 10)).toBe(91);
    expect(maxScrollOffset(11, 10)).toBe(2);
  });
});
