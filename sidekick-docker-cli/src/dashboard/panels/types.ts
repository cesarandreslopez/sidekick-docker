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
  handler: (item: PanelItem) => void;
  condition?: (item: PanelItem) => boolean;
  confirm?: boolean;
  confirmMessage?: string;
}

/** A keybinding declared by a panel or globally. */
export interface KeyBinding {
  keys: string[];
  label: string;
  category?: string;
  handler: (item?: PanelItem) => void;
  condition?: (item?: PanelItem) => boolean;
}

/** A tab in the detail pane for a selected item. */
export interface DetailTab {
  label: string;
  render: (item: PanelItem, metrics: DockerDashboardMetrics) => string;
  autoScrollBottom?: boolean;
}

/** A panel that populates the side list and detail pane. */
export interface SidePanel {
  readonly id: string;
  readonly title: string;
  readonly shortcutKey: number;
  readonly detailTabs: DetailTab[];

  getItems(metrics: DockerDashboardMetrics): PanelItem[];
  getActions(): PanelAction[];
  getKeybindings?(): KeyBinding[];
  getSearchableText?(item: PanelItem): string;
  getStatusHints?(): string;
  onActivate?(): void;
  onDeactivate?(): void;
  dispose?(): void;
}
