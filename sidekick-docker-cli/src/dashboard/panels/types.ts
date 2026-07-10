import type { DockerDashboardMetrics } from '../DockerState';

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
  /** Return a Promise to get async feedback (in-progress → success/error toasts). */
  handler: (item: PanelItem) => void | Promise<void>;
  condition?: (item: PanelItem) => boolean;
  confirm?: boolean;
  confirmMessage?: string;
  /** Risk level for confirmation dialog: 'low' (yellow), 'high' (red, default), 'batch' (red, shows count). */
  confirmSeverity?: 'low' | 'high' | 'batch';
}

/** Default error handler for panel actions — logs to debug console. */
export const defaultOnError = (msg: string): void => { console.debug(msg); };

/** A tab in the detail pane for a selected item. */
export interface DetailTab {
  label: string;
  render: (item: PanelItem, metrics: DockerDashboardMetrics) => string | string[];
  autoScrollBottom?: boolean;
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
