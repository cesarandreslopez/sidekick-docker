import type { PanelItem } from '../panels/types';
import { truncateMiddle } from '../../formatters';

/** Columns consumed before the label text: the selection marker and the state icon. */
export const MARKER_AND_ICON_COLS = 2;
/** A badge is only drawn when the name keeps at least this many columns. */
export const MIN_NAME_COLS = 10;

/** One side-list row, cut into the runs SideList colours separately. */
export interface SideRow {
  /** Leading indent from the label (service rows under a project). */
  prefix: string;
  icon: string;
  /** The rest of the label, fitted and padded to exactly its budget. */
  text: string;
  /** ` ${badge}` when it fits, else ''. */
  badge: string;
}

/**
 * Fit the label text into `width` columns. When it is too long, a trailing
 * hint after the name (a port) goes first, then the name is shortened in the
 * middle so its distinguishing end ("-1", ":tag") survives.
 */
export function fitSideText(rest: string, name: string | undefined, width: number): string {
  if (width <= 0) return '';
  if (rest.length <= width) return rest;
  const idx = name ? rest.indexOf(name) : -1;
  if (name && idx >= 0) {
    const head = rest.slice(0, idx);
    if (head.length + name.length <= width) return head + name;
    return head + truncateMiddle(name, width - head.length);
  }
  return truncateMiddle(rest, width);
}

/**
 * Lay out a row of `innerWidth` columns (border excluded) with `right`
 * right-aligned. Width math runs on plain text only: the health badge used
 * to sit in the label with its colour codes, so the row was cut mid-escape.
 */
export function layoutSideRow(item: PanelItem, innerWidth: number, right: string): SideRow {
  const trimmed = item.label.trimStart();
  const prefix = item.label.substring(0, item.label.length - trimmed.length);
  // First character cluster is the icon (handles multi-byte unicode).
  const segments = [...trimmed];
  const icon = segments[0] ?? '';
  const rest = segments.slice(1).join('');

  // Layout: "{marker}{prefix}{icon}{text}{badge} {right}"
  const leftWidth = innerWidth - right.length - (right.length ? 1 : 0);
  const restWidth = Math.max(0, leftWidth - prefix.length - MARKER_AND_ICON_COLS);
  const badge = item.badge && restWidth - (item.badge.length + 1) >= MIN_NAME_COLS ? ` ${item.badge}` : '';
  const textWidth = restWidth - badge.length;
  const fitted = fitSideText(rest, item.name, textWidth);
  return { prefix, icon, text: fitted + ' '.repeat(Math.max(0, textWidth - fitted.length)), badge };
}
