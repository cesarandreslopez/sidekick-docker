/**
 * Shared overlay geometry: the overlay components import these constants for
 * positioning/sizing and the mouse handler uses the hit functions, so click
 * targets can never drift from what is rendered.
 */
import { SORT_OPTIONS } from './dashboardTypes';

export interface OverlayAction {
  key: string;
  label: string;
  confirm?: boolean;
}

export const CONTEXT_MENU_ORIGIN = { top: 2, left: 2 } as const;
export const SORT_OVERLAY_ORIGIN = { top: 2, left: 2 } as const;
export const CONFIRM_OVERLAY_ORIGIN = { top: 3, left: 3 } as const;

export const CONTEXT_MENU_HINT = 'j/k select  Enter/click run  Esc close';
const SORT_OVERLAY_HINT = 'j/k select  Enter apply  R reverse  Esc close';
/** Derived, not hardcoded: adding a sort field must not require editing this too. */
export const SORT_OPTION_COUNT = SORT_OPTIONS.length;

/**
 * Natural box width of the sort overlay (hint + padding + borders). Exported
 * so the component renders at exactly the width sortHit tests against — the
 * two must not drift.
 */
export const SORT_OVERLAY_WIDTH = SORT_OVERLAY_HINT.length + 4;

/**
 * The context menu's title row: the item the actions will hit, so a refresh
 * that moved the selection cannot go unnoticed. Capped at the hint's width so
 * a long name never widens the box.
 */
export function contextMenuTitle(name?: string): string {
  const title = name ? `☰ ${name}` : '☰ Actions';
  return title.length <= CONTEXT_MENU_HINT.length ? title : `${title.slice(0, CONTEXT_MENU_HINT.length - 1)}…`;
}

/** Rendered width of a context-menu action row: ` ${key} ` (or `▸${key} `) + `${label}[ ⚠] `. */
function contextRowWidth(action: OverlayAction): number {
  return action.key.length + 2 + action.label.length + (action.confirm ? 2 : 0) + 1;
}

/** Total box width (borders + padding + content) of the context menu. */
export function contextMenuWidth(actions: OverlayAction[], title = contextMenuTitle()): number {
  const content = Math.max(
    title.length,
    CONTEXT_MENU_HINT.length,
    ...actions.map(contextRowWidth),
  );
  return content + 2 /* paddingX */ + 2 /* borders */;
}

/**
 * Map a click to a context-menu action index, or null when outside any row.
 * Row layout: top+0 border, top+1 title, top+2+i action rows.
 */
export function contextMenuHit(x: number, y: number, actions: OverlayAction[], title = contextMenuTitle()): number | null {
  const { top, left } = CONTEXT_MENU_ORIGIN;
  const width = contextMenuWidth(actions, title);
  if (x < left || x >= left + width) return null;
  const row = y - (top + 2);
  if (row < 0 || row >= actions.length) return null;
  return row;
}

export type ConfirmSeverity = 'low' | 'high' | 'batch';

/** The warning line under the message; empty for low severity. */
export const CONFIRM_WARNING: Record<ConfirmSeverity, string> = {
  low: '',
  high: '  This cannot be undone.',
  batch: '  This cannot be undone.',
};

/** The message wraps to at most this many rows (the last one ellipsized). */
export const CONFIRM_MAX_MESSAGE_LINES = 3;

/**
 * Word-wrap `text` to `width` columns in at most `maxLines` rows; words
 * longer than a row are split, and text left over ends the last row in "…".
 */
export function wrapText(text: string, width: number, maxLines: number): string[] {
  const w = Math.max(1, width);
  const lines: string[] = [];
  let current = '';
  const words = text.split(/\s+/).filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    let word = words[i];
    while (word.length > 0) {
      const sep = current ? 1 : 0;
      if (current.length + sep + word.length <= w) {
        current += (sep ? ' ' : '') + word;
        word = '';
      } else if (!current && word.length > w) {
        lines.push(word.slice(0, w));
        word = word.slice(w);
      } else {
        lines.push(current);
        current = '';
      }
    }
  }
  if (current || lines.length === 0) lines.push(current);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  const last = kept[maxLines - 1];
  kept[maxLines - 1] = `${last.length >= w ? last.slice(0, w - 1) : last}…`;
  return kept;
}

export interface ConfirmLayout {
  /** Box width, or undefined when unclamped and natural. */
  width: number;
  /** Message rows as rendered (each drawn after one leading space). */
  lines: string[];
}

/**
 * Size of the confirm overlay and its wrapped message. It used to truncate
 * the message to one row, cutting off the target's name or the warning
 * ("…It will be stopped first").
 */
export function confirmLayout(message: string, severity: ConfirmSeverity, maxWidth?: number): ConfirmLayout {
  const natural = Math.max(message.length + 1, CONFIRM_WARNING[severity].length, 36) + 6;
  const width = maxWidth !== undefined ? Math.min(natural, maxWidth) : natural;
  // Borders (2) + paddingX (4) + the leading space before each row.
  const textWidth = Math.max(1, width - 7);
  return { width, lines: wrapText(message, textWidth, CONFIRM_MAX_MESSAGE_LINES) };
}

/**
 * Buttons row of the confirm overlay. Relative rows: border, pad, title,
 * blank, message (one per wrapped line), [warning], blank, buttons.
 */
export function confirmButtonsRow(severity: ConfirmSeverity, messageLines = 1): number {
  const warningRow = CONFIRM_WARNING[severity] ? 1 : 0;
  return CONFIRM_OVERLAY_ORIGIN.top + 5 + Math.max(1, messageLines) + warningRow;
}

/**
 * Map a click to a confirm-overlay button. Content starts at left + 1 (border)
 * + 2 (paddingX); the buttons row is ` y Yes ` + 2 spaces + ` n No `.
 */
export function confirmHit(x: number, y: number, severity: ConfirmSeverity, messageLines = 1): 'yes' | 'no' | null {
  if (y !== confirmButtonsRow(severity, messageLines)) return null;
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
