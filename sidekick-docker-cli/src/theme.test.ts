import { describe, expect, it } from 'vitest';
import { ACCENT, ACCENT_FILL, ACCENT_RGB, contrastRatio } from './theme';

describe('theme', () => {
  it('computes WCAG contrast', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrastRatio('#777777', '#777777')).toBe(1);
  });

  it('keeps the accent readable on dark and light terminals', () => {
    for (const bg of ['#000000', '#1e1e1e', '#282c34', '#ffffff', '#fdf6e3']) {
      expect(contrastRatio(ACCENT, bg)).toBeGreaterThanOrEqual(3);
    }
  });

  it('keeps white text readable on the fill', () => {
    expect(contrastRatio('#ffffff', ACCENT_FILL)).toBeGreaterThanOrEqual(4.5);
  });

  it('ACCENT_RGB matches ACCENT', () => {
    expect(`#${ACCENT_RGB.map(c => c.toString(16).padStart(2, '0')).join('')}`).toBe(ACCENT.toLowerCase());
  });
});
