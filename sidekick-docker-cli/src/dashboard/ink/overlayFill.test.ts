import React from 'react';
import { describe, expect, it } from 'vitest';
import { Box, Text, renderToString } from 'ink';
import { ConfirmOverlay } from './ConfirmOverlay';
import { ContextMenuOverlay } from './ContextMenuOverlay';
import { SortOverlay } from './SortOverlay';
import {
  CONFIRM_OVERLAY_ORIGIN, CONTEXT_MENU_ORIGIN, SORT_OVERLAY_ORIGIN, SORT_OVERLAY_WIDTH,
  confirmLayout, contextMenuTitle, contextMenuWidth,
} from './overlayHitTest';
import type { PanelAction } from '../panels/types';
import { OVERLAY_FILL } from '../../theme';

const COLUMNS = 80;
const ROWS = 24;

/** The overlay drawn over a screen full of 'X', as the dashboard draws it over the list and logs. */
function drawOver(overlay: React.ReactElement): string[] {
  const backdrop = Array.from({ length: ROWS }, (_, i) => React.createElement(Text, { key: i }, 'X'.repeat(COLUMNS)));
  const out = renderToString(
    React.createElement(Box, { flexDirection: 'column', width: COLUMNS, height: ROWS }, ...backdrop, overlay),
    { columns: COLUMNS },
  );
  return out.replace(/\x1b\[[0-9;]*m/g, '').split('\n');
}

/** Rows strictly inside a box's border. */
function interior(lines: string[], top: number, left: number, width: number): string[] {
  const rows: string[] = [];
  for (let y = top + 1; y < lines.length; y++) {
    const row = [...lines[y]];
    // The bottom border row ends the box.
    if (/[─═]/.test(row[left + 1] ?? '')) break;
    rows.push(row.slice(left + 1, left + width - 1).join(''));
  }
  return rows;
}

const actions: PanelAction[] = [
  { key: 's', label: 'Start', handler: () => {} },
  { key: 'd', label: 'Remove', handler: () => {}, confirm: true },
];

describe('overlays hide what is under them (T4)', () => {
  it('uses a fill that adds no colour of its own', () => {
    expect(OVERLAY_FILL).toBe('none');
  });

  it('confirm dialog', () => {
    const message = 'Remove web?';
    const width = confirmLayout(message, 'high', COLUMNS - 6).width;
    const lines = drawOver(React.createElement(ConfirmOverlay, { message, severity: 'high', maxWidth: COLUMNS - 6, onConfirm: () => {}, onCancel: () => {} }));
    const rows = interior(lines, CONFIRM_OVERLAY_ORIGIN.top, CONFIRM_OVERLAY_ORIGIN.left, width);
    expect(rows.length).toBeGreaterThan(4);
    for (const row of rows) expect(row).not.toContain('X');
  });

  it('actions menu', () => {
    const title = contextMenuTitle('web');
    const width = contextMenuWidth(actions, title);
    const lines = drawOver(React.createElement(ContextMenuOverlay, { actions, selectedIndex: 0, title, maxWidth: COLUMNS - 6 }));
    const rows = interior(lines, CONTEXT_MENU_ORIGIN.top, CONTEXT_MENU_ORIGIN.left, width);
    expect(rows.length).toBeGreaterThanOrEqual(actions.length + 1);
    for (const row of rows) expect(row).not.toContain('X');
  });

  it('sort menu', () => {
    const lines = drawOver(React.createElement(SortOverlay, { selectedIndex: 0, currentField: 'state', reversed: false, maxWidth: COLUMNS - 6 }));
    const rows = interior(lines, SORT_OVERLAY_ORIGIN.top, SORT_OVERLAY_ORIGIN.left, SORT_OVERLAY_WIDTH);
    expect(rows.length).toBeGreaterThan(5);
    for (const row of rows) expect(row).not.toContain('X');
  });
});
