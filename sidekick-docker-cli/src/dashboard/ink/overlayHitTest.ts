/**
 * Shared overlay geometry: the overlay components import these constants for
 * positioning/sizing and the mouse handler uses the hit functions, so click
 * targets can never drift from what is rendered.
 */

export interface OverlayAction {
  key: string;
  label: string;
  confirm?: boolean;
}

export const CONTEXT_MENU_ORIGIN = { top: 2, left: 2 } as const;
export const SORT_OVERLAY_ORIGIN = { top: 2, left: 2 } as const;
export const CONFIRM_OVERLAY_ORIGIN = { top: 3, left: 3 } as const;

const CONTEXT_MENU_TITLE = '☰ Actions';
const CONTEXT_MENU_HINT = 'j/k select  Enter/click run  Esc close';
const SORT_OVERLAY_HINT = 'j/k select  Enter apply  R reverse  Esc close';
export const SORT_OPTION_COUNT = 7;

/**
 * Natural box width of the sort overlay (hint + padding + borders). Exported
 * so the component renders at exactly the width sortHit tests against — the
 * two must not drift.
 */
export const SORT_OVERLAY_WIDTH = SORT_OVERLAY_HINT.length + 4;

/** Rendered width of a context-menu action row: ` ${key} ` + `${label}[ ⚠] `. */
function contextRowWidth(action: OverlayAction): number {
  return action.key.length + 2 + action.label.length + (action.confirm ? 2 : 0) + 1;
}

/** Total box width (borders + padding + content) of the context menu. */
export function contextMenuWidth(actions: OverlayAction[]): number {
  const content = Math.max(
    CONTEXT_MENU_TITLE.length,
    CONTEXT_MENU_HINT.length,
    ...actions.map(contextRowWidth),
  );
  return content + 2 /* paddingX */ + 2 /* borders */;
}

/**
 * Map a click to a context-menu action index, or null when outside any row.
 * Row layout: top+0 border, top+1 title, top+2+i action rows.
 */
export function contextMenuHit(x: number, y: number, actions: OverlayAction[]): number | null {
  const { top, left } = CONTEXT_MENU_ORIGIN;
  const width = contextMenuWidth(actions);
  if (x < left || x >= left + width) return null;
  const row = y - (top + 2);
  if (row < 0 || row >= actions.length) return null;
  return row;
}

/** Buttons row of the confirm overlay (relative rows: border, pad, title, blank, message, [warning], blank, buttons). */
export function confirmButtonsRow(severity: 'low' | 'high' | 'batch'): number {
  const warningRow = severity === 'low' ? 0 : 1;
  return CONFIRM_OVERLAY_ORIGIN.top + 6 + warningRow;
}

/**
 * Map a click to a confirm-overlay button. Content starts at left + 1 (border)
 * + 2 (paddingX); the buttons row is ` y Yes ` + 2 spaces + ` n No `.
 */
export function confirmHit(x: number, y: number, severity: 'low' | 'high' | 'batch'): 'yes' | 'no' | null {
  if (y !== confirmButtonsRow(severity)) return null;
  const contentX = CONFIRM_OVERLAY_ORIGIN.left + 3;
  if (x >= contentX && x < contentX + 7) return 'yes';
  if (x >= contentX + 9 && x < contentX + 15) return 'no';
  return null;
}

/**
 * Map a click to a sort-overlay option index (0-based), or null.
 * Row layout: top+0 border, top+1 title, top+2+i options.
 */
export function sortHit(x: number, y: number): number | null {
  const { top, left } = SORT_OVERLAY_ORIGIN;
  const width = SORT_OVERLAY_WIDTH;
  if (x < left || x >= left + width) return null;
  const row = y - (top + 2);
  if (row < 0 || row >= SORT_OPTION_COUNT) return null;
  return row;
}
