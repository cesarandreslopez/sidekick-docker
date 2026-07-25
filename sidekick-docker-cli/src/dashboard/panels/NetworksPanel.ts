import type { NetworkInfo } from 'sidekick-docker-shared';
import { DockerClient } from 'sidekick-docker-shared';
import type { DockerDashboardMetrics } from '../DockerState';
import { panelData } from './types';
import type { SidePanel, PanelItem, PanelAction, DetailTab } from './types';
import { truncate, colorizeDetailKey, colorizeId, colorizeBool, colorizeNetworkContainer, colorizeEnvLine, sectionHeader } from '../../formatters';

export class NetworksPanel implements SidePanel {
  readonly id = 'networks';
  readonly title = 'Networks';
  readonly shortcutKey = 5;

  private client: DockerClient;
  private onAction: () => void;
  private lastMetrics: DockerDashboardMetrics | null = null;

  constructor(client: DockerClient, onAction: () => void) {
    this.client = client;
    this.onAction = onAction;
  }

  readonly detailTabs: DetailTab[] = [
    {
      label: 'Info',
      render: (item) => {
        const net = panelData<NetworkInfo>(item);
        const lines = [
          sectionHeader('Identity'),
          colorizeDetailKey(`  ID:         ${colorizeId(net.id)}`),
          colorizeDetailKey(`  Name:       ${net.name}`),
          colorizeDetailKey(`  Driver:     ${net.driver}`),
          colorizeDetailKey(`  Scope:      ${net.scope}`),
          colorizeDetailKey(`  Default:    ${colorizeBool(net.isDefault)}`),
          colorizeDetailKey(`  Internal:   ${colorizeBool(net.internal)}`),
          colorizeDetailKey(`  Attachable: ${colorizeBool(net.attachable)}`),
        ];

        // Addressing: the daemon has always returned this; it used to be discarded.
        lines.push('', sectionHeader('Addressing'));
        if (net.ipamDriver) {
          lines.push(colorizeDetailKey(`  IPAM:       ${net.ipamDriver}`));
        }
        if (net.ipam.length === 0) {
          lines.push('  (no address pools configured)');
        }
        for (const pool of net.ipam) {
          if (pool.subnet) lines.push(colorizeDetailKey(`  Subnet:     ${pool.subnet}`));
          if (pool.gateway) lines.push(colorizeDetailKey(`  Gateway:    ${pool.gateway}`));
          if (pool.ipRange) lines.push(colorizeDetailKey(`  IP range:   ${pool.ipRange}`));
        }

        lines.push('', sectionHeader(`Containers (${net.containers.length})`));
        for (const c of net.containers) {
          const addr = c.ipv4Address ? `  ${colorizeId(c.ipv4Address)}` : '';
          lines.push(`  ${colorizeNetworkContainer(c.containerName, c.containerId)}${addr}`);
        }
        if (net.containers.length === 0) {
          lines.push('  (none)');
        }

        const labelKeys = Object.keys(net.labels);
        if (labelKeys.length > 0) {
          lines.push('', sectionHeader(`Labels (${labelKeys.length})`));
          for (const k of labelKeys.sort()) {
            lines.push(`  ${colorizeEnvLine(`${k}=${net.labels[k]}`)}`);
          }
        }
        return lines.join('\n');
      },
    },
  ];

  getItems(metrics: DockerDashboardMetrics): PanelItem[] {
    this.lastMetrics = metrics;
    return metrics.networks.map((net): PanelItem => {
      const icon = net.isDefault ? '\u25C6' : '\u25C7'; // ◆ vs ◇
      const countLabel = net.containers.length > 0 ? `${net.containers.length}` : '';
      return {
        id: net.id,
        label: `${icon} ${truncate(net.name, 38)}`,
        sortKey: net.isDefault ? 0 : 1,
        data: net,
        iconColor: net.isDefault ? '#2B4C7E' : 'gray',
        rightLabel: countLabel,
        rightColor: net.containers.length > 0 ? 'green' : 'gray',
      };
    });
  }

  getActions(): PanelAction[] {
    return [
      {
        key: 'd',
        label: 'Remove',
        confirm: true,
        confirmMessage: (item) => `Remove network "${panelData<NetworkInfo>(item).name}"?`,
        confirmSeverity: 'high',
        handler: (item) => {
          const net = panelData<NetworkInfo>(item);
          return this.client.removeNetwork(net.id).then(() => { this.onAction(); });
        },
        condition: (item) => {
          const net = panelData<NetworkInfo>(item);
          return !net.isDefault && net.containers.length === 0;
        },
      },
      {
        key: 'P',
        label: 'Prune',
        confirm: true,
        confirmMessage: () => {
          const n = this.lastMetrics?.networks.filter(net => !net.isDefault && net.containers.length === 0).length ?? 0;
          return n > 0 ? `Prune ${n} unused network${n === 1 ? '' : 's'}?` : 'Prune all unused networks?';
        },
        confirmSeverity: 'batch',
        handler: () => {
          return this.client.pruneNetworks().then((r) => {
            this.onAction();
            const n = r.networksDeleted.length;
            return `Pruned ${n} network${n === 1 ? '' : 's'}`;
          });
        },
      },
    ];
  }

  getSearchableText(item: PanelItem): string {
    const net = panelData<NetworkInfo>(item);
    return `${net.name} ${net.driver}`;
  }
}
