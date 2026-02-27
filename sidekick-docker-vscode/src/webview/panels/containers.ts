import type { PanelDefinition, PanelItem, ActionDefinition, DetailTabDefinition } from './types';
import type { DashboardStateSnapshot, SerializedContainerInfo } from '../../types/messages';
import type { WebviewState } from '../state';
import { stateIcon, stateColor, truncate, formatPorts, formatBytes, formatMemory, colorizeLogEntry, escapeHtml, colorizeState, colorizeId, renderKvGrid, renderEnvGrid } from '../formatters';


function findContainer(id: string, snapshot: DashboardStateSnapshot): SerializedContainerInfo | undefined {
  return snapshot.containers.find(c => c.id === id);
}

export const containersPanel: PanelDefinition = {
  id: 'containers',
  title: 'Containers',
  shortcutKey: 1,

  detailTabs: [
    {
      label: 'Logs',
      render: (item: PanelItem, state: WebviewState): string => {
        const entries = state.logs.get(item.id);
        if (!entries || entries.length === 0) return '<div class="empty-state"><div class="empty-icon">\u{1F4DC}</div><div class="empty-title">No logs yet</div><div class="empty-subtitle">Logs will appear as the container produces output</div></div>';
        return `<div class="log-content">${entries.map(e => colorizeLogEntry(e)).join('\n')}</div>`;
      },
      autoScrollBottom: true,
    },
    {
      label: 'Stats',
      render: (item: PanelItem, state: WebviewState): string => {
        if (!state.snapshot) return '';
        const c = findContainer(item.id, state.snapshot);
        if (!c || c.state !== 'running') return 'Container is not running.';

        const statsData = state.stats.get(item.id);
        if (!statsData || statsData.loading) {
          return '<span class="stats-spinner"></span> Loading stats...';
        }
        if (!statsData.stats) return 'No stats available.';

        const s = statsData.stats;
        const barColor = (v: number) => v > 80 ? 'red' : v > 50 ? 'yellow' : 'green';
        const cpuClamped = Math.min(s.cpuPercent, 100);
        const memClamped = Math.min(s.memoryPercent, 100);

        return `<div class="stats-grid">
  <div class="stat-row">
    <div class="stat-row-label"><span class="stat-label">CPU</span><span class="stat-value">${escapeHtml(s.cpuPercent.toFixed(1))}%</span></div>
    <div class="stat-bar-track"><div class="stat-bar-fill ${barColor(s.cpuPercent)}" style="width:${cpuClamped.toFixed(1)}%"></div></div>
  </div>
  <div class="stat-row">
    <div class="stat-row-label"><span class="stat-label">Memory</span><span class="stat-value">${escapeHtml(formatMemory(s.memoryUsage, s.memoryLimit))} (${escapeHtml(s.memoryPercent.toFixed(1))}%)</span></div>
    <div class="stat-bar-track"><div class="stat-bar-fill ${barColor(s.memoryPercent)}" style="width:${memClamped.toFixed(1)}%"></div></div>
  </div>
  <div class="stat-row">
    <div class="stat-row-label"><span class="stat-label">Network I/O</span></div>
    <div class="stat-net"><span class="stat-net-rx">\u25BC ${escapeHtml(formatBytes(s.networkRx))}</span><span class="stat-net-tx">\u25B2 ${escapeHtml(formatBytes(s.networkTx))}</span></div>
  </div>
  <div class="stat-pids">PIDs: ${escapeHtml(String(s.pids))}</div>
</div>`;
      },
    },
    {
      label: 'Env',
      render: (item: PanelItem, state: WebviewState): string => {
        const env = state.envVars.get(item.id);
        if (!env) return 'Loading environment variables...';
        if (env.length === 0) return 'No environment variables set.';
        return renderEnvGrid(env);
      },
    },
    {
      label: 'Config',
      render: (item: PanelItem, state: WebviewState): string => {
        if (!state.snapshot) return '';
        const c = findContainer(item.id, state.snapshot);
        if (!c) return '';
        const pairs: [string, string][] = [
          ['ID', colorizeId(c.id.substring(0, 12))],
          ['Name', escapeHtml(c.name)],
          ['Image', escapeHtml(c.image)],
          ['State', colorizeState(c.state)],
          ['Status', escapeHtml(c.status)],
          ['Created', escapeHtml(new Date(c.created).toLocaleString())],
          ['Ports', escapeHtml(formatPorts(c.ports))],
        ];
        if (c.composeProject) {
          pairs.push(['Compose', escapeHtml(`${c.composeProject}/${c.composeService}`)]);
        }
        return renderKvGrid(pairs);
      },
    },
  ] as DetailTabDefinition[],

  getItems(snapshot: DashboardStateSnapshot): PanelItem[] {
    return snapshot.containers.map(c => ({
      id: c.id,
      label: truncate(c.name, 22),
      icon: stateIcon(c.state),
      iconColor: stateColor(c.state),
      sortKey: c.state === 'running' ? 0 : 1,
      badge: c.state === 'running' ? c.status.replace(/^Up /, '') : c.state,
      group: c.state === 'running' ? 'Running' : 'Stopped',
    }));
  },

  getActions(item: PanelItem, snapshot: DashboardStateSnapshot): ActionDefinition[] {
    const c = findContainer(item.id, snapshot);
    if (!c) return [];
    const actions: ActionDefinition[] = [];

    if (c.state !== 'running') {
      actions.push({ key: 's', label: 'Start', actionType: 'start' });
    }
    if (c.state === 'running') {
      actions.push({ key: 'S', label: 'Stop', actionType: 'stop' });
      actions.push({ key: 'r', label: 'Restart', actionType: 'restart' });
    }
    actions.push({ key: 'd', label: 'Remove', actionType: 'remove', confirm: true, confirmMessage: 'Remove this container?' });
    if (c.state === 'running') {
      actions.push({ key: 'e', label: 'Exec', actionType: 'exec' });
    }

    return actions;
  },

  getSearchableText(item: PanelItem, snapshot: DashboardStateSnapshot): string {
    const c = findContainer(item.id, snapshot);
    return c ? `${c.name} ${c.image} ${c.state}` : item.label;
  },
};
