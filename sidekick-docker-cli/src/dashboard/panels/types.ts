import type { DockerDashboardMetrics } from '../DockerState';
import { ansi } from '../../formatters';

/** An item displayed in the side panel list. */
export interface PanelItem {
  id: string;
  label: string;
  sortKey: number;
  data: unknown;
  /** Right-aligned secondary text (e.g. uptime, size). */
  rightLabel?: string;
  /** Color for the rightLabel text. */
  rightColor?: string;
  /** Color for the leading icon character. */
  iconColor?: string;
}

/** An action available for the selected item. */
export interface PanelAction {
  key: string;
  label: string;
  /**
   * Return a Promise to get async feedback (in-progress → success/error toasts).
   * A resolved/returned string becomes the success toast text (e.g. "Pruned — 1.2 GB reclaimed").
   *
   * `void` here is deliberate and cannot be `undefined`: most handlers are written as
   * `() => { client.stopContainer(id); }`, whose inferred return type is `void` — which is
   * not assignable to `string | undefined`.
   */
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  handler: (item: PanelItem) => void | string | Promise<void | string>;
  condition?: (item: PanelItem) => boolean;
  confirm?: boolean;
  /** Static message, or a function to interpolate the target's name/count. */
  confirmMessage?: string | ((item: PanelItem) => string);
  /** Risk level for confirmation dialog: 'low' (yellow), 'high' (red, default), 'batch' (red, shows count). */
  confirmSeverity?: 'low' | 'high' | 'batch';
}

/** A tab in the detail pane for a selected item. */
export interface DetailTab {
  label: string;
  render: (item: PanelItem, metrics: DockerDashboardMetrics) => string | string[];
  autoScrollBottom?: boolean;
}

/**
 * Message for a detail tab whose lazy fetch failed.
 *
 * These fetches used to swallow their error, leaving the pane on "Loading…"
 * indefinitely with no way to tell a slow call from a broken one.
 */
export function detailFetchError(what: string, reason: string): string {
  // Through `ansi`, not raw escapes: those bypass the NO_COLOR/--no-color gate
  // in formatters.ts and leave this message colored when everything else is not.
  return `${ansi.red(`Could not load ${what}.`)}\n\n${reason}\n\n${ansi.gray('Reselect the item to retry.')}`;
}

/** Safely extract typed data from a PanelItem. Throws if data is null/undefined. */
export function panelData<T>(item: PanelItem): T {
  if (item.data == null) {
    throw new Error(`Panel item "${item.id}" has no data`);
  }
  return item.data as T;
}

/** A panel that populates the side list and detail pane. */
export interface SidePanel {
  readonly id: string;
  readonly title: string;
  readonly shortcutKey: number;
  readonly detailTabs: DetailTab[];

  getItems(metrics: DockerDashboardMetrics): PanelItem[];
  getActions(): PanelAction[];
  getSearchableText?(item: PanelItem): string;
  onActivate?(): void;
  onDeactivate?(): void;
  dispose?(): void;
}
