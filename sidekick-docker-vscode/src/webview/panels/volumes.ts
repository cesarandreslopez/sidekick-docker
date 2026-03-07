import type { PanelDefinition, PanelItem, ActionDefinition, DetailTabDefinition } from './types';
import type { DashboardStateSnapshot, SerializedVolumeInfo } from '../../types/messages';
import type { WebviewState } from '../state';
import { truncate, escapeHtml, colorizeBool, renderKvGrid } from '../formatters';

function findVolume(name: string, snapshot: DashboardStateSnapshot): SerializedVolumeInfo | undefined {
  return snapshot.volumes.find(v => v.name === name);
}

export const volumesPanel: PanelDefinition = {
  id: 'volumes',
  title: 'Volumes',
  shortcutKey: 4,

  detailTabs: [
    {
      label: 'Info',
      render: (item: PanelItem, state: WebviewState): string => {
        if (!state.snapshot) return '';
        const vol = findVolume(item.id, state.snapshot);
        if (!vol) return '';
        return renderKvGrid([
          ['Name', escapeHtml(vol.name)],
          ['Driver', escapeHtml(vol.driver)],
          ['Mountpoint', escapeHtml(vol.mountpoint)],
          ['Created', escapeHtml(new Date(vol.created).toLocaleString())],
          ['In Use', colorizeBool(vol.isInUse)],
        ]);
      },
    },
  ] as DetailTabDefinition[],

  getItems(snapshot: DashboardStateSnapshot): PanelItem[] {
    return snapshot.volumes.map(vol => ({
      id: vol.name,
      label: truncate(vol.name, 26),
      icon: vol.isInUse ? '\u25CF' : '\u25CB',
      iconColor: vol.isInUse ? 'var(--vscode-foreground)' : 'var(--vscode-descriptionForeground)',
      sortKey: vol.isInUse ? 0 : 1,
      badge: vol.driver,
      tooltip: vol.name,
    }));
  },

  getActions(item: PanelItem, snapshot: DashboardStateSnapshot): ActionDefinition[] {
    const vol = findVolume(item.id, snapshot);
    const actions: ActionDefinition[] = [];
    if (vol && !vol.isInUse) {
      actions.push({ key: 'd', label: 'Remove', actionType: 'remove', confirm: true, confirmMessage: 'Remove this volume?' });
    }
    actions.push({ key: 'P', label: 'Prune', actionType: 'prune', confirm: true, confirmMessage: 'Prune all unused volumes?' });
    return actions;
  },

  getSearchableText(item: PanelItem, snapshot: DashboardStateSnapshot): string {
    const vol = findVolume(item.id, snapshot);
    return vol ? `${vol.name} ${vol.driver}` : item.label;
  },
};
