import type { VolumeInfo } from 'sidekick-docker-shared';
import { DockerClient } from 'sidekick-docker-shared';
import type { DockerDashboardMetrics } from '../DockerState';
import { defaultOnError, panelData } from './types';
import type { SidePanel, PanelItem, PanelAction, DetailTab } from './types';
import { truncate, colorizeDetailKey, colorizeBool } from '../../formatters';

export class VolumesPanel implements SidePanel {
  readonly id = 'volumes';
  readonly title = 'Volumes';
  readonly shortcutKey = 4;

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
        const vol = panelData<VolumeInfo>(item);
        return [
          colorizeDetailKey(`Name:       ${vol.name}`),
          colorizeDetailKey(`Driver:     ${vol.driver}`),
          colorizeDetailKey(`Mountpoint: ${vol.mountpoint}`),
          colorizeDetailKey(`Created:    ${vol.created.toLocaleString()}`),
          colorizeDetailKey(`In Use:     ${colorizeBool(vol.isInUse)}`),
        ].join('\n');
      },
    },
  ];

  getItems(metrics: DockerDashboardMetrics): PanelItem[] {
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
        confirmMessage: 'Remove this volume?',
        handler: (item) => {
          const vol = panelData<VolumeInfo>(item);
          this.client.removeVolume(vol.name).then(() => this.onAction()).catch(e => this.onError(String(e)));
        },
        condition: (item) => !panelData<VolumeInfo>(item).isInUse,
      },
      {
        key: 'P',
        label: 'Prune',
        confirm: true,
        confirmMessage: 'Prune all unused volumes?',
        handler: () => {
          this.client.pruneVolumes().then(() => this.onAction()).catch(e => this.onError(String(e)));
        },
      },
    ];
  }

  getSearchableText(item: PanelItem): string {
    const vol = panelData<VolumeInfo>(item);
    return `${vol.name} ${vol.driver}`;
  }
}
