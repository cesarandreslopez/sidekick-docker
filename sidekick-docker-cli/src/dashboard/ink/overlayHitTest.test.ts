import { describe, it, expect } from 'vitest';
import { contextMenuHit, confirmHit, confirmButtonsRow, sortHit, contextMenuWidth, CONTEXT_MENU_ORIGIN, CONFIRM_OVERLAY_ORIGIN } from './overlayHitTest';

const ACTIONS = [
  { key: 's', label: 'Start' },
  { key: 'd', label: 'Remove', confirm: true },
];

describe('contextMenuHit', () => {
  // Rows: top+0 border, top+1 title, top+2 first action.
  const firstRow = CONTEXT_MENU_ORIGIN.top + 2;

  it('maps rows to action indexes', () => {
    expect(contextMenuHit(CONTEXT_MENU_ORIGIN.left + 2, firstRow, ACTIONS)).toBe(0);
    expect(contextMenuHit(CONTEXT_MENU_ORIGIN.left + 2, firstRow + 1, ACTIONS)).toBe(1);
  });

  it('returns null for the title row, below the actions, and outside the box', () => {
    expect(contextMenuHit(CONTEXT_MENU_ORIGIN.left + 2, firstRow - 1, ACTIONS)).toBeNull();
    expect(contextMenuHit(CONTEXT_MENU_ORIGIN.left + 2, firstRow + ACTIONS.length, ACTIONS)).toBeNull();
    expect(contextMenuHit(CONTEXT_MENU_ORIGIN.left + contextMenuWidth(ACTIONS) + 1, firstRow, ACTIONS)).toBeNull();
  });
});

describe('confirmHit', () => {
  it('hits the Yes and No buttons on the buttons row (high severity)', () => {
    const y = confirmButtonsRow('high');
    const contentX = CONFIRM_OVERLAY_ORIGIN.left + 3;
    expect(confirmHit(contentX + 1, y, 'high')).toBe('yes');
    expect(confirmHit(contentX + 10, y, 'high')).toBe('no');
    expect(confirmHit(contentX + 30, y, 'high')).toBeNull();
  });

  it('low severity has the buttons one row higher (no warning line)', () => {
    expect(confirmButtonsRow('low')).toBe(confirmButtonsRow('high') - 1);
  });

  it('misses on other rows', () => {
    expect(confirmHit(CONFIRM_OVERLAY_ORIGIN.left + 4, confirmButtonsRow('high') - 1, 'high')).toBeNull();
  });
});

describe('sortHit', () => {
  it('maps option rows and rejects the title and out-of-range rows', () => {
    expect(sortHit(4, 4)).toBe(0);
    expect(sortHit(4, 10)).toBe(6);
    expect(sortHit(4, 3)).toBeNull();
    expect(sortHit(4, 11)).toBeNull();
  });
});
