import type { ImageInfo } from 'sidekick-docker-shared';
import { DockerClient, pruneConfirmFor, pruneResultText, imageDisplayName, removeImageConfirmMessage, actionText } from 'sidekick-docker-shared';
import type { DockerDashboardMetrics } from '../DockerState';
import { DockerState } from '../DockerState';
import { panelData, detailFetchError } from './types';
import type { SidePanel, PanelItem, PanelAction, DetailTab } from './types';
import { formatBytes, truncate, colorizeDetailKey, colorizeId, colorizeBool, sectionHeader } from '../../formatters';
import { ACCENT } from '../../theme';

export class ImagesPanel implements SidePanel {
  readonly id = 'images';
  readonly title = 'Images';
  readonly shortcutKey = 3;

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
        const img = panelData<ImageInfo>(item);
        return [
          colorizeDetailKey(`ID:       ${colorizeId(img.id)}`),
          colorizeDetailKey(`Tags:     ${img.repoTags.join(', ')}`),
          colorizeDetailKey(`Size:     ${formatBytes(img.size)}`),
          colorizeDetailKey(`Created:  ${img.created.toLocaleString()}`),
          colorizeDetailKey(`Dangling: ${colorizeBool(img.isDangling)}`),
        ].join('\n');
      },
    },
    {
      label: 'Layers',
      render: (item, metrics) => {
        const img = panelData<ImageInfo>(item);
        const failure = metrics.detailErrors.get(DockerState.detailErrorKey('layers', img.id));
        if (failure) return detailFetchError('layers', failure);
        const layers = metrics.imageLayers.get(img.id);
        if (!layers) return 'Loading layers...';
        if (layers.length === 0) return 'No layer history available.';
        const total = layers.reduce((sum, l) => sum + l.size, 0);
        const lines = [sectionHeader(`Image Layers (${layers.length} layers, ${formatBytes(total)} total)`), ''];
        lines.push(`${'  #'.padEnd(5)} ${'SIZE'.padEnd(12)} COMMAND`);
        for (let i = 0; i < layers.length; i++) {
          const l = layers[i];
          const num = String(i + 1).padStart(3);
          const size = l.size > 0 ? formatBytes(l.size).padEnd(10) : '0 B'.padEnd(10);
          const cmd = truncate(l.createdBy, 60);
          lines.push(`  ${num}   ${size} ${cmd}`);
          // comment and created ride along in ImageLayer and were never shown.
          if (l.comment) {
            lines.push(`        ${colorizeId(truncate(l.comment, 68))}`);
          }
        }
        const largest = layers.reduce((max, l) => l.size > max.size ? l : max, layers[0]);
        const largestIdx = layers.indexOf(largest) + 1;
        if (largest.size > 0) {
          lines.push('');
          lines.push(`Largest: #${largestIdx} (${formatBytes(largest.size)}) — ${truncate(largest.createdBy, 40)}`);
        }
        return lines.join('\n');
      },
    },
  ];

  getItems(metrics: DockerDashboardMetrics): PanelItem[] {
    this.lastMetrics = metrics;
    return metrics.images.map((img): PanelItem => {
      const tag = imageDisplayName(img);
      const icon = img.isDangling ? '\u25CB' : '\u25CF'; // ○ vs ●
      return {
        id: img.id,
        label: `${icon} ${tag}`,
        name: tag,
        sortKey: img.isDangling ? 1 : 0,
        data: img,
        iconColor: img.isDangling ? 'gray' : ACCENT,
        rightLabel: formatBytes(img.size),
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
        confirmMessage: (item) => removeImageConfirmMessage(panelData<ImageInfo>(item)),
        confirmSeverity: 'high',
        actionType: 'remove',
        handler: (item) => {
          const img = panelData<ImageInfo>(item);
          return this.client.removeImage(img.id).then(() => {
            this.onAction();
            return actionText('remove', imageDisplayName(img)).success;
          });
        },
      },
      {
        key: 'P',
        label: 'Prune',
        confirm: true,
        confirmMessage: () => pruneConfirmFor('images', this.lastMetrics?.images ?? []),
        confirmSeverity: 'batch',
        actionType: 'prune',
        targetName: () => 'dangling images',
        handler: () => {
          return this.client.pruneImages().then((r) => {
            this.onAction();
            return pruneResultText('images', r);
          });
        },
      },
    ];
  }

  getSearchableText(item: PanelItem): string {
    const img = panelData<ImageInfo>(item);
    return img.repoTags.join(' ');
  }
}
