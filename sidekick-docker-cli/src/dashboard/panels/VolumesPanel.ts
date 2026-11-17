import type { VolumeInfo } from 'sidekick-docker-shared';
import { DockerClient, pruneConfirmFor, pruneResultText, pruneNothingText, removeVolumeConfirmMessage, actionText } from 'sidekick-docker-shared';
import type { DockerDashboardMetrics } from '../DockerState';
import { panelData } from './types';
import type { SidePanel, PanelItem, PanelAction, DetailTab } from './types';
import { colorizeDetailKey, colorizeBool, sectionHeader } from '../../formatters';

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
        label: `${icon} ${vol.name}`,
        name: vol.name,
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
        confirmMessage: (item) => removeVolumeConfirmMessage(panelData<VolumeInfo>(item).name),
        confirmSeverity: 'high',
        actionType: 'remove',
        handler: (item) => {
          const vol = panelData<VolumeInfo>(item);
          return this.client.removeVolume(vol.name).then(() => {
            this.onAction();
            return actionText('remove', vol.name).success;
          });
        },
        condition: (item) => !panelData<VolumeInfo>(item).isInUse,
      },
      {
        key: 'P',
        label: 'Prune',
        confirm: true,
        confirmMessage: () => pruneConfirmFor('volumes', this.lastMetrics?.volumes ?? []),
        nothingToDo: () => pruneNothingText('volumes', this.lastMetrics?.volumes ?? []),
        confirmSeverity: 'batch',
        actionType: 'prune',
        targetName: () => 'unused volumes',
        handler: () => {
          return this.client.pruneVolumes().then((r) => {
            this.onAction();
            return pruneResultText('volumes', r);
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
