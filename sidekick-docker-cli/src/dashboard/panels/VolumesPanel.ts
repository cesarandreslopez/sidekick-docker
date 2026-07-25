import type { VolumeInfo } from 'sidekick-docker-shared';
import { DockerClient } from 'sidekick-docker-shared';
import type { DockerDashboardMetrics } from '../DockerState';
import { panelData } from './types';
import type { SidePanel, PanelItem, PanelAction, DetailTab } from './types';
import { formatBytes, truncate, colorizeDetailKey, colorizeBool, sectionHeader } from '../../formatters';

export class VolumesPanel implements SidePanel {
  readonly id = 'volumes';
  readonly title = 'Volumes';
  readonly shortcutKey = 4;

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
        const vol = panelData<VolumeInfo>(item);
        const lines = [
          colorizeDetailKey(`Name:       ${vol.name}`),
          colorizeDetailKey(`Driver:     ${vol.driver}`),
          colorizeDetailKey(`Mountpoint: ${vol.mountpoint}`),
          colorizeDetailKey(`Created:    ${vol.created.toLocaleString()}`),
          colorizeDetailKey(`In Use:     ${colorizeBool(vol.isInUse)}`),
        ];
        // "In use" alone does not tell you what to stop before removing it.
        if (vol.usedBy.length > 0) {
          lines.push('', sectionHeader(`Used by (${vol.usedBy.length})`));
          for (const name of vol.usedBy) lines.push(`  ${name}`);
        }
        return lines.join('\n');
      },
    },
  ];

  getItems(metrics: DockerDashboardMetrics): PanelItem[] {
    this.lastMetrics = metrics;
    return metrics.volumes.map((vol): PanelItem => {
      const icon = vol.isInUse ? '\u25CF' : '\u25CB'; // ● vs ○
      return {
        id: vol.name,
        label: `${icon} ${truncate(vol.name, 38)}`,
        sortKey: vol.isInUse ? 0 : 1,
        data: vol,
        iconColor: vol.isInUse ? 'green' : 'gray',
        rightLabel: vol.driver,
        rightColor: 'gray',
      };
    });
  }

  getActions(): PanelAction[] {
    return [
      {
        key: 'd',
        label: 'Remove',
        confirm: true,
        confirmMessage: (item) => `Remove volume "${panelData<VolumeInfo>(item).name}"?`,
        confirmSeverity: 'high',
        handler: (item) => {
          const vol = panelData<VolumeInfo>(item);
          return this.client.removeVolume(vol.name).then(() => { this.onAction(); });
        },
        condition: (item) => !panelData<VolumeInfo>(item).isInUse,
      },
      {
        key: 'P',
        label: 'Prune',
        confirm: true,
        confirmMessage: () => {
          const n = this.lastMetrics?.volumes.filter(v => !v.isInUse).length ?? 0;
          return n > 0 ? `Prune ${n} unused volume${n === 1 ? '' : 's'}?` : 'Prune all unused volumes?';
        },
        confirmSeverity: 'batch',
        handler: () => {
          return this.client.pruneVolumes().then((r) => {
            this.onAction();
            return `Pruned — ${formatBytes(r.spaceReclaimed)} reclaimed`;
          });
        },
      },
    ];
  }

  getSearchableText(item: PanelItem): string {
    const vol = panelData<VolumeInfo>(item);
    return `${vol.name} ${vol.driver}`;
  }
}
