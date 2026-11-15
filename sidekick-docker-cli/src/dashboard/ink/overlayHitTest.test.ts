import { describe, it, expect } from 'vitest';
import { contextMenuHit, confirmHit, confirmButtonsRow, sortHit, contextMenuWidth, contextMenuTitle, confirmLayout, wrapText, CONTEXT_MENU_ORIGIN, CONFIRM_OVERLAY_ORIGIN, CONTEXT_MENU_HINT } from './overlayHitTest';

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

describe('contextMenuTitle (T3)', () => {
  it('names the target and never widens the menu', () => {
    expect(contextMenuTitle('web')).toBe('☰ web');
    expect(contextMenuTitle()).toBe('☰ Actions');
    const long = contextMenuTitle('a-really-long-container-name-from-a-compose-project-1');
    expect(long.length).toBe(CONTEXT_MENU_HINT.length);
    expect(long.endsWith('…')).toBe(true);
    expect(contextMenuWidth(ACTIONS, long)).toBe(contextMenuWidth(ACTIONS));
  });

  it('hit-tests with the same title the menu is drawn with', () => {
    const title = contextMenuTitle('web');
    const firstRow = CONTEXT_MENU_ORIGIN.top + 2;
    const right = CONTEXT_MENU_ORIGIN.left + contextMenuWidth(ACTIONS, title) - 1;
    expect(contextMenuHit(right, firstRow, ACTIONS, title)).toBe(0);
    expect(contextMenuHit(right + 1, firstRow, ACTIONS, title)).toBeNull();
  });
});

describe('wrapText / confirmLayout (T8)', () => {
  it('word-wraps within the width', () => {
    expect(wrapText('Remove container "web"? It will be stopped first.', 20, 3)).toEqual([
      'Remove container',
      '"web"? It will be',
      'stopped first.',
    ]);
  });

  it('splits words longer than a row and ellipsizes past the line limit', () => {
    expect(wrapText('abcdefghij', 4, 3)).toEqual(['abcd', 'efgh', 'ij']);
    const capped = wrapText('one two three four five six seven', 5, 2);
    expect(capped).toHaveLength(2);
    expect(capped[1].endsWith('…')).toBe(true);
    expect(capped.every(l => l.length <= 5)).toBe(true);
  });

  it('keeps a short message on one row at its natural width', () => {
    const layout = confirmLayout('Remove image "nginx"?', 'high', 200);
    expect(layout.lines).toEqual(['Remove image "nginx"?']);
  });

  it('wraps a long message to at most 3 rows when the terminal clamps the box', () => {
    const message = 'Force-remove running container "shop-web-1"? It will be stopped first.';
    const layout = confirmLayout(message, 'high', 54);
    expect(layout.width).toBe(54);
    expect(layout.lines.length).toBeGreaterThan(1);
    expect(layout.lines.length).toBeLessThanOrEqual(3);
    expect(layout.lines.join(' ')).toBe(message);
    expect(layout.lines.every(l => l.length <= 54 - 7)).toBe(true);
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

  it('moves the buttons down one row per extra message line (T8)', () => {
    expect(confirmButtonsRow('high', 3)).toBe(confirmButtonsRow('high') + 2);
    const contentX = CONFIRM_OVERLAY_ORIGIN.left + 3;
    expect(confirmHit(contentX + 1, confirmButtonsRow('high', 2), 'high', 2)).toBe('yes');
    expect(confirmHit(contentX + 1, confirmButtonsRow('high', 1), 'high', 2)).toBeNull();
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
