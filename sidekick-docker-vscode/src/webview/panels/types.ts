import type { DashboardStateSnapshot, PanelId } from '../../types/messages';
import type { WebviewState } from '../state';

export interface PanelItem {
  id: string;
  /** Full text; CSS ellipsizes it. */
  label: string;
  /**
   * Kept visible after `label` when the row is too narrow (an image's `:tag`),
   * so long references truncate in the middle instead of losing the tag.
   */
  labelTail?: string;
  /** Rendered indented under the previous row (a compose service under its project). */
  indent?: boolean;
  icon: string;
  iconColor: string;
  sortKey: number;
  badge?: string;
  group?: string;
  tooltip?: string;
  /** Container health, rendered as an inline badge in the side list. */
  health?: 'healthy' | 'unhealthy' | 'starting';
}

export interface ActionDefinition {
  key: string;
  label: string;
  actionType: string;
  confirm?: boolean;
  confirmMessage?: string;
  /** Visual weight of the confirm dialog: low (yellow), high/batch (red). Defaults to high. */
  confirmSeverity?: 'low' | 'high' | 'batch';
  condition?: (item: PanelItem, snapshot: DashboardStateSnapshot) => boolean;
}

export interface DetailTabDefinition {
  label: string;
  render: (item: PanelItem, state: WebviewState) => string;
  autoScrollBottom?: boolean;
}

export interface PanelDefinition {
  id: PanelId;
  title: string;
  shortcutKey: number;
  detailTabs: DetailTabDefinition[];
  getItems(snapshot: DashboardStateSnapshot): PanelItem[];
  getActions(item: PanelItem, snapshot: DashboardStateSnapshot): ActionDefinition[];
  getSearchableText(item: PanelItem, snapshot: DashboardStateSnapshot): string;
}
