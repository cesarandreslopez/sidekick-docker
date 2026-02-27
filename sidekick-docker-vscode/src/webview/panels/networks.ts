import type { PanelDefinition, PanelItem, ActionDefinition, DetailTabDefinition } from './types';
import type { DashboardStateSnapshot, SerializedNetworkInfo } from '../../types/messages';
import type { WebviewState } from '../state';
import { truncate, escapeHtml, colorizeId, colorizeBool, colorizeNetworkContainer, renderKvGrid } from '../formatters';

function findNetwork(id: string, snapshot: DashboardStateSnapshot): SerializedNetworkInfo | undefined {
  return snapshot.networks.find(n => n.id === id);
}

export const networksPanel: PanelDefinition = {
  id: 'networks',
  title: 'Networks',
  shortcutKey: 5,

  detailTabs: [
    {
      label: 'Info',
      render: (item: PanelItem, state: WebviewState): string => {
        if (!state.snapshot) return '';
        const net = findNetwork(item.id, state.snapshot);
        if (!net) return '';
        let html = renderKvGrid([
          ['ID', colorizeId(net.id.substring(0, 12))],
          ['Name', escapeHtml(net.name)],
          ['Driver', escapeHtml(net.driver)],
          ['Scope', escapeHtml(net.scope)],
          ['Default', colorizeBool(net.isDefault)],
        ]);
        html += `<div style="margin-top:10px;">Containers (${net.containers.length}):</div>`;
        if (net.containers.length === 0) {
          html += '<div style="color:var(--vscode-descriptionForeground);padding-left:8px;">(none)</div>';
        } else {
          for (const c of net.containers) {
            html += `<div style="padding-left:8px;">${colorizeNetworkContainer(c.containerName, c.containerId.substring(0, 12))}</div>`;
          }
        }
        return html;
      },
    },
  ] as DetailTabDefinition[],

  getItems(snapshot: DashboardStateSnapshot): PanelItem[] {
    return snapshot.networks.map(net => ({
      id: net.id,
      label: truncate(net.name, 20),
      icon: net.isDefault ? '\u25C6' : '\u25C7',
      iconColor: net.isDefault ? 'var(--vscode-foreground)' : 'var(--vscode-descriptionForeground)',
      sortKey: net.isDefault ? 0 : 1,
      badge: net.containers.length > 0 ? `${net.containers.length} container${net.containers.length > 1 ? 's' : ''}` : undefined,
    }));
  },

  getActions(item: PanelItem, snapshot: DashboardStateSnapshot): ActionDefinition[] {
    const net = findNetwork(item.id, snapshot);
    const actions: ActionDefinition[] = [];
    if (net && !net.isDefault && net.containers.length === 0) {
      actions.push({ key: 'd', label: 'Remove', actionType: 'remove', confirm: true, confirmMessage: 'Remove this network?' });
    }
    actions.push({ key: 'P', label: 'Prune', actionType: 'prune', confirm: true, confirmMessage: 'Prune all unused networks?' });
    return actions;
  },

  getSearchableText(item: PanelItem, snapshot: DashboardStateSnapshot): string {
    const net = findNetwork(item.id, snapshot);
    return net ? `${net.name} ${net.driver}` : item.label;
  },
};
