import type { PanelDefinition, PanelItem, ActionDefinition, DetailTabDefinition } from './types';
import type { DashboardStateSnapshot, SerializedImageInfo } from '../../types/messages';
import type { WebviewState } from '../state';
import { formatBytes, truncate, escapeHtml, colorizeId, colorizeBool, renderKvGrid } from '../formatters';

function findImage(id: string, snapshot: DashboardStateSnapshot): SerializedImageInfo | undefined {
  return snapshot.images.find(i => i.id === id);
}

export const imagesPanel: PanelDefinition = {
  id: 'images',
  title: 'Images',
  shortcutKey: 3,

  detailTabs: [
    {
      label: 'Info',
      render: (item: PanelItem, state: WebviewState): string => {
        if (!state.snapshot) return '';
        const img = findImage(item.id, state.snapshot);
        if (!img) return '';
        return renderKvGrid([
          ['ID', colorizeId(img.id.substring(0, 19))],
          ['Tags', escapeHtml(img.repoTags.join(', '))],
          ['Size', escapeHtml(formatBytes(img.size))],
          ['Created', escapeHtml(new Date(img.created).toLocaleString())],
          ['Dangling', colorizeBool(img.isDangling)],
        ]);
      },
    },
  ] as DetailTabDefinition[],

  getItems(snapshot: DashboardStateSnapshot): PanelItem[] {
    return snapshot.images.map(img => {
      const tag = img.repoTags[0] || '<none>';
      return {
        id: img.id,
        label: truncate(tag, 22),
        icon: img.isDangling ? '\u25CB' : '\u25CF',
        iconColor: img.isDangling ? 'var(--vscode-descriptionForeground)' : 'var(--vscode-foreground)',
        sortKey: img.isDangling ? 1 : 0,
        badge: formatBytes(img.size),
      };
    });
  },

  getActions(): ActionDefinition[] {
    return [
      { key: 'd', label: 'Remove', actionType: 'remove', confirm: true, confirmMessage: 'Remove this image?' },
      { key: 'P', label: 'Prune', actionType: 'prune', confirm: true, confirmMessage: 'Prune all dangling images?' },
    ];
  },

  getSearchableText(item: PanelItem, snapshot: DashboardStateSnapshot): string {
    const img = findImage(item.id, snapshot);
    return img ? img.repoTags.join(' ') : item.label;
  },
};
