import type { DashboardStateSnapshot } from '../../types/messages';
import type { WebviewState } from '../state';

export interface PanelItem {
  id: string;
  label: string;
  icon: string;
  iconColor: string;
  sortKey: number;
  badge?: string;
  group?: string;
  tooltip?: string;
}

export interface ActionDefinition {
  key: string;
  label: string;
  actionType: string;
  confirm?: boolean;
  confirmMessage?: string;
  condition?: (item: PanelItem, snapshot: DashboardStateSnapshot) => boolean;
}

export interface DetailTabDefinition {
  label: string;
  render: (item: PanelItem, state: WebviewState) => string;
  autoScrollBottom?: boolean;
}

export interface PanelDefinition {
  id: string;
  title: string;
  shortcutKey: number;
  detailTabs: DetailTabDefinition[];
  getItems(snapshot: DashboardStateSnapshot): PanelItem[];
  getActions(item: PanelItem, snapshot: DashboardStateSnapshot): ActionDefinition[];
  getSearchableText(item: PanelItem, snapshot: DashboardStateSnapshot): string;
}
