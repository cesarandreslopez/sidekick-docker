import type { PanelDefinition, PanelItem, ActionDefinition, DetailTabDefinition } from './types';
import type { DashboardStateSnapshot, SerializedNetworkInfo } from '../../types/messages';
import type { WebviewState } from '../state';
import { escapeHtml, colorizeId, colorizeBool, colorizeNetworkContainer, renderKvGrid } from '../formatters';
import { pruneConfirmFor, pruneNothingText, removeNetworkConfirmMessage } from 'sidekick-docker-shared/formatters';

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
        const rows: [string, string][] = [
          ['ID', colorizeId(net.id)],
          ['Name', escapeHtml(net.name)],
          ['Driver', escapeHtml(net.driver)],
          ['Scope', escapeHtml(net.scope)],
          ['Default', colorizeBool(net.isDefault)],
          ['Internal', colorizeBool(net.internal)],
          ['Attachable', colorizeBool(net.attachable)],
        ];
        // The daemon returns addressing on the listing; it used to be dropped,
        // which made "what subnet is this" unanswerable.
        if (net.ipamDriver) rows.push(['IPAM', escapeHtml(net.ipamDriver)]);
        for (const pool of net.ipam) {
          if (pool.subnet) rows.push(['Subnet', escapeHtml(pool.subnet)]);
          if (pool.gateway) rows.push(['Gateway', escapeHtml(pool.gateway)]);
          if (pool.ipRange) rows.push(['IP range', escapeHtml(pool.ipRange)]);
        }
        let html = renderKvGrid(rows);
        html += `<div style="margin-top:10px;">Containers (${net.containers.length}):</div>`;
        if (net.containers.length === 0) {
          html += '<div style="color:var(--vscode-descriptionForeground);padding-left:8px;">(none)</div>';
        } else {
          for (const c of net.containers) {
            const addr = c.ipv4Address ? ` ${colorizeId(c.ipv4Address)}` : '';
            html += `<div style="padding-left:8px;">${colorizeNetworkContainer(c.containerName, c.containerId)}${addr}</div>`;
          }
        }
        // Labels arrive on the listing (compose project, driver options); the TUI shows them.
        const labelKeys = Object.keys(net.labels).sort();
        if (labelKeys.length > 0) {
          html += `<div class="detail-section">Labels (${labelKeys.length})</div>`;
          html += renderKvGrid(labelKeys.map((k): [string, string] => [k, escapeHtml(net.labels[k])]));
        }
        return html;
      },
    },
  ] as DetailTabDefinition[],

  getItems(snapshot: DashboardStateSnapshot): PanelItem[] {
    return snapshot.networks.map(net => ({
      id: net.id,
      label: net.name,
      icon: net.isDefault ? '\u25C6' : '\u25C7',
      iconColor: net.isDefault ? 'var(--vscode-foreground)' : 'var(--vscode-descriptionForeground)',
      sortKey: net.isDefault ? 0 : 1,
      badge: net.containers.length > 0 ? `${net.containers.length} container${net.containers.length > 1 ? 's' : ''}` : undefined,
      tooltip: net.name,
      stateText: net.isDefault ? 'default network' : undefined,
    }));
  },

  getActions(item: PanelItem, snapshot: DashboardStateSnapshot): ActionDefinition[] {
    const net = findNetwork(item.id, snapshot);
    const actions: ActionDefinition[] = [];
    if (net && !net.isDefault && net.containers.length === 0) {
      actions.push({ key: 'd', label: 'Remove', actionType: 'remove', confirm: true, confirmMessage: removeNetworkConfirmMessage(net.name), confirmSeverity: 'high' });
    }
    actions.push({ key: 'P', label: 'Prune', actionType: 'prune', nothingToDo: pruneNothingText('networks', snapshot.networks) ?? undefined, confirm: true, confirmMessage: pruneConfirmFor('networks', snapshot.networks), confirmSeverity: 'batch' });
    return actions;
  },

  getSearchableText(item: PanelItem, snapshot: DashboardStateSnapshot): string {
    const net = findNetwork(item.id, snapshot);
    return net ? `${net.name} ${net.driver}` : item.label;
  },
};
