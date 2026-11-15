import { describe, it, expect } from 'vitest';
import { fitSideText, layoutSideRow, MARKER_AND_ICON_COLS, MIN_NAME_COLS } from './sideListLayout';
import type { PanelItem } from '../panels/types';

const row = (overrides: Partial<PanelItem>): PanelItem => ({ id: 'x', label: '● web', sortKey: 0, data: {}, ...overrides });

describe('fitSideText (T10)', () => {
  it('keeps text that fits', () => {
    expect(fitSideText(' web :8080', 'web', 20)).toBe(' web :8080');
  });

  it('drops the trailing port hint before shortening the name', () => {
    expect(fitSideText(' shop-web-1 :8080', 'shop-web-1', 12)).toBe(' shop-web-1');
  });

  it('middle-truncates the name, keeping the replica suffix', () => {
    expect(fitSideText(' myproject-web-1 :8080', 'myproject-web-1', 11)).toBe(' myproje…-1');
    expect(fitSideText(' myproject-web-2 :8080', 'myproject-web-2', 11)).toBe(' myproje…-2');
  });

  it('middle-truncates the whole text when the name is unknown', () => {
    expect(fitSideText(' averyverylongname', undefined, 10)).toHaveLength(10);
  });
});

describe('layoutSideRow (T9)', () => {
  const inner = 26; // 28-column list minus its border

  it('fills exactly the row: marker + prefix + icon + text + badge + " right"', () => {
    const r = layoutSideRow(row({ label: '● shop-web-1 :8080', name: 'shop-web-1', badge: 'healthy' }), inner, '2h');
    const width = 1 /* marker */ + r.prefix.length + 1 /* icon */ + r.text.length + r.badge.length + ' 2h'.length;
    expect(width).toBe(inner);
    expect(r.badge).toBe(' healthy');
    expect(r.icon).toBe('●');
  });

  it('keeps colour codes out of the label: the badge is its own run', () => {
    const r = layoutSideRow(row({ label: '● web', name: 'web', badge: 'unhealthy' }), inner, '');
    expect(r.text).not.toContain('\x1b');
    expect(r.badge).toBe(' unhealthy');
  });

  it('drops the badge rather than squeeze the name below the minimum', () => {
    const narrow = MARKER_AND_ICON_COLS + MIN_NAME_COLS + ' healthy'.length - 1;
    const r = layoutSideRow(row({ label: '● shop-web-1', name: 'shop-web-1', badge: 'healthy' }), narrow, '');
    expect(r.badge).toBe('');
    expect(r.text.length).toBe(narrow - MARKER_AND_ICON_COLS);
  });

  it('keeps the indent of service rows', () => {
    const r = layoutSideRow(row({ label: '  ● web', name: 'web' }), inner, '1/1');
    expect(r.prefix).toBe('  ');
    expect(1 + r.prefix.length + 1 + r.text.length + ' 1/1'.length).toBe(inner);
  });
});
