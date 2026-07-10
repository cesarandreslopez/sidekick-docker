import type { PanelDefinition, PanelItem, ActionDefinition, DetailTabDefinition } from './types';
import type { DashboardStateSnapshot, SerializedContainerInfo } from '../../types/messages';
import type { WebviewState } from '../state';
import { stateIcon, stateColor, truncate, formatPorts, formatBytes, formatMemory, colorizeLogEntry, escapeHtml, escapeAttr, colorizeState, colorizeHealth, colorizeId, renderKvGrid, renderEnvGrid, renderSparkline, renderSeveritySparkline } from '../formatters';
import { filterLine, LogTemplateEngine } from 'sidekick-docker-shared/log';
import type { SeverityCounts } from 'sidekick-docker-shared/log';


function findContainer(id: string, snapshot: DashboardStateSnapshot): SerializedContainerInfo | undefined {
  return snapshot.containers.find(c => c.id === id);
}

function renderSeverityBadges(counts: SeverityCounts): string {
  const badges: string[] = [];
  if (counts.error > 0) badges.push(`<span class="sev-badge error">E:${counts.error}</span>`);
  if (counts.warn > 0) badges.push(`<span class="sev-badge warn">W:${counts.warn}</span>`);
  if (counts.info > 0) badges.push(`<span class="sev-badge info">I:${counts.info}</span>`);
  if (counts.debug > 0) badges.push(`<span class="sev-badge debug">D:${counts.debug}</span>`);
  return badges.join('');
}

function renderSingleLogPane(containerId: string, state: WebviewState, logRoot: string): string {
  const entries = state.logs.get(containerId);
  if (!entries || entries.length === 0) return '<div class="empty-state"><div class="empty-icon">\u{1F4DC}</div><div class="empty-title">No logs yet</div><div class="empty-subtitle">Logs will appear as the container produces output</div></div>';

  const firstKey = `${entries[0]?.timestamp ?? ''}:${entries[0]?.stream ?? ''}:${entries[0]?.message ?? ''}`;
  let html = `<div class="log-shell" data-log-root="${logRoot}" data-item-id="${escapeAttr(containerId)}" data-rendered-count="${entries.length}" data-first-key="${escapeAttr(firstKey)}">`;

  const counts = state.logSeverityCounts.get(containerId);
  html += `<div class="severity-counts" data-log-severity>${counts && counts.total > 0 ? renderSeverityBadges(counts) : ''}</div>`;

  // Only show filter bar on primary pane
  if (logRoot === 'container') {
    html += `<div class="log-filter-bar">
      <input type="text" id="log-filter-input" placeholder="Filter logs..." value="${escapeAttr(state.logFilterString)}" data-container-id="${escapeAttr(containerId)}" />
      <span class="filter-mode" id="log-filter-mode" title="Click to toggle">${state.logFilterMode}</span>
      <span class="copy-logs-btn" id="copy-logs-btn" title="Copy logs to clipboard (c)">Copy</span>
      <span class="match-count" data-log-match-count>`;
  }

  const query = state.logFilterString;
  const mode = state.logFilterMode;
  let filteredHtml = '';
  let matchCount = 0;

  if (query) {
    for (const e of entries) {
      const result = filterLine(e.message, query, mode);
      if (result.matched) {
        matchCount++;
        filteredHtml += colorizeLogEntry(e, result.matches);
      }
    }
    if (logRoot === 'container') html += `${matchCount} matches`;
  } else {
    for (const e of entries) {
      filteredHtml += colorizeLogEntry(e);
    }
  }

  if (logRoot === 'container') {
    html += `</span></div>`;
  }

  html += `<div class="log-content" data-log-content>${filteredHtml || '<div style="padding:8px;color:var(--vscode-descriptionForeground)">No matching logs</div>'}</div>`;
  html += `</div>`;
  return html;
}

export const containersPanel: PanelDefinition = {
  id: 'containers',
  title: 'Containers',
  shortcutKey: 1,

  detailTabs: [
    {
      label: 'Logs',
      render: (item: PanelItem, state: WebviewState): string => {
        const compareItemId = state.compareItemIds['containers'] ?? null;

        // Single-pane mode (no compare)
        if (!compareItemId) {
          return renderSingleLogPane(item.id, state, 'container');
        }

        // Compare mode: side-by-side
        const primaryName = state.snapshot?.containers.find(c => c.id === item.id)?.name ?? item.id.slice(0, 12);
        const secondaryName = state.snapshot?.containers.find(c => c.id === compareItemId)?.name ?? compareItemId.slice(0, 12);

        return `<div class="log-compare-container">
          <div class="log-compare-pane" data-compare="primary">
            <div class="compare-label">${escapeHtml(primaryName)}</div>
            ${renderSingleLogPane(item.id, state, 'container')}
          </div>
          <div class="log-compare-divider"></div>
          <div class="log-compare-pane" data-compare="secondary">
            <div class="compare-label">${escapeHtml(secondaryName)}</div>
            ${renderSingleLogPane(compareItemId, state, 'container-compare')}
          </div>
        </div>`;
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
        // Text band beside the number so color is not the only high-load signal
        const band = (v: number) => v > 80 ? ' <span class="stat-band">high</span>' : '';
        const cpuClamped = Math.min(s.cpuPercent, 100);
        const memClamped = Math.min(s.memoryPercent, 100);

        const cpuSparkline = statsData.cpuHistory && statsData.cpuHistory.length > 1
          ? `<div class="sparkline-row cpu">${renderSparkline(statsData.cpuHistory)}</div>` : '';
        const memSparkline = statsData.memoryHistory && statsData.memoryHistory.length > 1
          ? `<div class="sparkline-row memory">${renderSparkline(statsData.memoryHistory)}</div>` : '';

        // Rate sparklines for Network and Block I/O
        const netRxSparkline = statsData.networkRxRateHistory && statsData.networkRxRateHistory.length > 1
          ? `<div class="sparkline-row net-rx">${renderSparkline(statsData.networkRxRateHistory)}</div>` : '';
        const netTxSparkline = statsData.networkTxRateHistory && statsData.networkTxRateHistory.length > 1
          ? `<div class="sparkline-row net-tx">${renderSparkline(statsData.networkTxRateHistory)}</div>` : '';
        const blockReadSparkline = statsData.blockReadRateHistory && statsData.blockReadRateHistory.length > 1
          ? `<div class="sparkline-row block-read">${renderSparkline(statsData.blockReadRateHistory)}</div>` : '';
        const blockWriteSparkline = statsData.blockWriteRateHistory && statsData.blockWriteRateHistory.length > 1
          ? `<div class="sparkline-row block-write">${renderSparkline(statsData.blockWriteRateHistory)}</div>` : '';

        // Log severity sparkline
        const logSevSparkline = statsData.logSeveritySeries && statsData.logSeveritySeries.length > 0
          ? `<div class="stat-row">
    <div class="stat-row-label"><span class="stat-label">Log Activity</span></div>
    <div class="sparkline-row severity">${renderSeveritySparkline(statsData.logSeveritySeries)}</div>
  </div>` : '';

        return `<div class="stats-grid" data-stats-root="container">
  <div class="stat-row">
    <div class="stat-row-label"><span class="stat-label">CPU</span><span class="stat-value">${escapeHtml(s.cpuPercent.toFixed(1))}%${band(s.cpuPercent)}</span></div>
    <div class="stat-bar-track"><div class="stat-bar-fill ${barColor(s.cpuPercent)}" style="width:${cpuClamped.toFixed(1)}%"></div></div>
    ${cpuSparkline}
  </div>
  <div class="stat-row">
    <div class="stat-row-label"><span class="stat-label">Memory</span><span class="stat-value">${escapeHtml(formatMemory(s.memoryUsage, s.memoryLimit))} (${escapeHtml(s.memoryPercent.toFixed(1))}%)${band(s.memoryPercent)}</span></div>
    <div class="stat-bar-track"><div class="stat-bar-fill ${barColor(s.memoryPercent)}" style="width:${memClamped.toFixed(1)}%"></div></div>
    ${memSparkline}
  </div>
  <div class="stat-row">
    <div class="stat-row-label"><span class="stat-label">Network I/O</span></div>
    <div class="stat-net"><span class="stat-net-rx">\u25BC ${escapeHtml(formatBytes(s.networkRx))}</span><span class="stat-net-tx">\u25B2 ${escapeHtml(formatBytes(s.networkTx))}</span></div>
    ${netRxSparkline}${netTxSparkline}
  </div>
  <div class="stat-row">
    <div class="stat-row-label"><span class="stat-label">Block I/O</span></div>
    <div class="stat-net"><span class="stat-net-rx">R ${escapeHtml(formatBytes(s.blockRead))}</span><span class="stat-net-tx">W ${escapeHtml(formatBytes(s.blockWrite))}</span></div>
    ${blockReadSparkline}${blockWriteSparkline}
  </div>
  <div class="stat-pids">PIDs: ${escapeHtml(String(s.pids))}</div>
  ${logSevSparkline}
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
          ['ID', colorizeId(c.id)],
          ['Name', escapeHtml(c.name)],
          ['Image', escapeHtml(c.image)],
          ['State', colorizeState(c.state)],
          ['Status', escapeHtml(c.status)],
          ...(c.healthStatus ? [['Health', colorizeHealth(c.healthStatus)] as [string, string]] : []),
          ['Created', escapeHtml(new Date(c.created).toLocaleString())],
          ['Ports', escapeHtml(formatPorts(c.ports))],
        ];
        if (c.composeProject) {
          pairs.push(['Compose', escapeHtml(`${c.composeProject}/${c.composeService}`)]);
        }
        return renderKvGrid(pairs);
      },
    },
    {
      label: 'Files',
      render: (item: PanelItem, state: WebviewState): string => {
        const changes = state.containerChanges.get(item.id);
        if (!changes) return 'Loading filesystem changes...';
        if (changes.length === 0) return '<div class="empty-state"><div class="empty-icon">\u{1F4C2}</div><div class="empty-title">No filesystem changes</div><div class="empty-subtitle">No changes detected in the container\'s filesystem</div></div>';

        let html = `<div style="font-size:12px;color:var(--vscode-descriptionForeground);margin-bottom:6px;">Filesystem Changes (${changes.length} files)</div>`;
        for (const c of changes) {
          const kind = c.kind === 'added' ? 'A' : c.kind === 'deleted' ? 'D' : 'C';
          const cls = `change-${c.kind}`;
          html += `<div class="change-row"><span class="change-kind ${cls}">${kind}</span><span class="change-path">${escapeHtml(c.path)}</span></div>`;
        }
        return html;
      },
    },
    {
      label: 'Patterns',
      render: (item: PanelItem, state: WebviewState): string => {
        const entries = state.logs.get(item.id);
        if (!entries || entries.length === 0) {
          return '<div class="empty-state"><div class="empty-icon">\u{1F50D}</div><div class="empty-title">No patterns yet</div><div class="empty-subtitle">Patterns will appear as logs stream in</div></div>';
        }

        // Compute templates from current log entries
        const engine = new LogTemplateEngine();
        for (const e of entries) {
          engine.push(e.message);
        }
        const templates = engine.getTemplates(20);

        if (templates.length === 0) {
          return '<div class="empty-state"><div class="empty-title">No patterns detected</div></div>';
        }

        let html = '<div class="patterns-list">';
        for (const t of templates) {
          const pattern = escapeHtml(t.pattern).replace(/&lt;\*&gt;/g, '<span class="tok-ip">&lt;*&gt;</span>');
          html += `<div class="pattern-row"><span class="pattern-count">${t.count}</span><span class="pattern-text">${pattern}</span></div>`;
        }
        html += '</div>';
        return html;
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
      tooltip: c.healthStatus ? `${c.name} (${c.healthStatus})` : c.name,
      health: c.healthStatus,
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
      actions.push({ key: 'p', label: 'Pause', actionType: 'pause' });
    }
    if (c.state === 'paused') {
      actions.push({ key: 'u', label: 'Unpause', actionType: 'unpause' });
    }
    actions.push({ key: 'c', label: 'Copy Logs', actionType: 'copyLogs' });
    actions.push({ key: 'd', label: 'Remove', actionType: 'remove', confirm: true, confirmMessage: `Remove container "${c.name}"?`, confirmSeverity: 'high' });
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
