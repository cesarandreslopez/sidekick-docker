import type { PanelDefinition, PanelItem, ActionDefinition, DetailTabDefinition } from './types';
import type { DashboardStateSnapshot, SerializedImageInfo } from '../../types/messages';
import type { WebviewState } from '../state';
import { formatBytes, truncate, escapeHtml, escapeAttr, colorizeId, colorizeBool, renderKvGrid, shortId } from '../formatters';


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
    {
      label: 'Layers',
      render: (item: PanelItem, state: WebviewState): string => {
        const layers = state.imageLayers.get(item.id);
        if (!layers) return 'Loading layers...';
        if (layers.length === 0) return '<div class="empty-state"><div class="empty-icon">\u{1F4E6}</div><div class="empty-title">No layer history</div><div class="empty-subtitle">No layer history available for this image</div></div>';

        const total = layers.reduce((sum, l) => sum + l.size, 0);
        let html = `<div style="font-size:12px;color:var(--vscode-descriptionForeground);margin-bottom:6px;">${layers.length} layers, ${escapeHtml(formatBytes(total))} total</div>`;
        for (let i = 0; i < layers.length; i++) {
          const l = layers[i];
          const num = String(i + 1);
          const sizeStr = l.size > 0 ? formatBytes(l.size) : '0 B';
          const sizeClass = l.size === 0 ? ' zero' : '';
          html += `<div class="layer-row"><span class="layer-num">${escapeHtml(num)}</span><span class="layer-size${sizeClass}">${escapeHtml(sizeStr)}</span><span class="layer-cmd" title="${escapeAttr(l.createdBy)}">${escapeHtml(truncate(l.createdBy, 80))}</span></div>`;
        }

        // Show largest layer
        const largest = layers.reduce((max, l) => l.size > max.size ? l : max, layers[0]);
        const largestIdx = layers.indexOf(largest) + 1;
        if (largest.size > 0) {
          html += `<div class="layer-summary">Largest: #${largestIdx} (${escapeHtml(formatBytes(largest.size))}) &mdash; ${escapeHtml(truncate(largest.createdBy, 50))}</div>`;
        }
        return html;
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
        tooltip: tag,
      };
    });
  },

  getActions(item: PanelItem, snapshot: DashboardStateSnapshot): ActionDefinition[] {
    const img = findImage(item.id, snapshot);
    const name = img?.repoTags[0] || shortId(item.id);
    return [
      { key: 'd', label: 'Remove', actionType: 'remove', confirm: true, confirmMessage: `Remove image "${name}"?`, confirmSeverity: 'high' },
      { key: 'P', label: 'Prune', actionType: 'prune', confirm: true, confirmMessage: 'Prune all dangling images?', confirmSeverity: 'batch' },
    ];
  },

  getSearchableText(item: PanelItem, snapshot: DashboardStateSnapshot): string {
    const img = findImage(item.id, snapshot);
    return img ? img.repoTags.join(' ') : item.label;
  },
};
