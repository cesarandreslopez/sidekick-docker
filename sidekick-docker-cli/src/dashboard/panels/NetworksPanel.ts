import type { NetworkInfo } from 'sidekick-docker-shared';
import { DockerClient } from 'sidekick-docker-shared';
import type { DockerDashboardMetrics } from '../DockerState';
import { defaultOnError, panelData } from './types';
import type { SidePanel, PanelItem, PanelAction, DetailTab } from './types';
import { truncate, colorizeDetailKey, colorizeId, colorizeBool, colorizeNetworkContainer } from '../../formatters';

export class NetworksPanel implements SidePanel {
  readonly id = 'networks';
  readonly title = 'Networks';
  readonly shortcutKey = 5;

  private client: DockerClient;
  private onAction: () => void;
  private onError: (msg: string) => void;

  constructor(client: DockerClient, onAction: () => void, onError?: (msg: string) => void) {
    this.client = client;
    this.onAction = onAction;
    this.onError = onError ?? defaultOnError;
  }

  readonly detailTabs: DetailTab[] = [
    {
      label: 'Info',
      render: (item) => {
        const net = panelData<NetworkInfo>(item);
        const lines = [
          colorizeDetailKey(`ID:      ${colorizeId(net.id)}`),
          colorizeDetailKey(`Name:    ${net.name}`),
          colorizeDetailKey(`Driver:  ${net.driver}`),
          colorizeDetailKey(`Scope:   ${net.scope}`),
          colorizeDetailKey(`Default: ${colorizeBool(net.isDefault)}`),
          '',
          `Containers (${net.containers.length}):`,
        ];
        for (const c of net.containers) {
          lines.push(`  ${colorizeNetworkContainer(c.containerName, c.containerId)}`);
        }
        if (net.containers.length === 0) {
          lines.push('  (none)');
        }
        return lines.join('\n');
      },
    },
  ];

  getItems(metrics: DockerDashboardMetrics): PanelItem[] {
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
        confirmMessage: 'Remove this network?',
        handler: (item) => {
          const net = panelData<NetworkInfo>(item);
          this.client.removeNetwork(net.id).then(() => this.onAction()).catch(e => this.onError(String(e)));
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
        confirmMessage: 'Prune all unused networks?',
        handler: () => {
          this.client.pruneNetworks().then(() => this.onAction()).catch(e => this.onError(String(e)));
        },
      },
    ];
  }

  getSearchableText(item: PanelItem): string {
    const net = panelData<NetworkInfo>(item);
    return `${net.name} ${net.driver}`;
  }
}
