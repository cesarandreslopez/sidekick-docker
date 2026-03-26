import type { PanelDefinition, PanelItem, ActionDefinition, DetailTabDefinition } from './types';
import type { DashboardStateSnapshot } from '../../types/messages';
import type { WebviewState } from '../state';
import { stateIcon, stateColor, escapeHtml, colorizeState, colorizeId, renderKvGrid, colorizeLogEntry } from '../formatters';

function getComposeLogKey(itemId: string): string {
  const parts = itemId.split(':');
  if (parts[0] === 'project') return parts.slice(1).join(':');
  if (parts[0] === 'service') return `${parts[1]}:${parts.slice(2).join(':')}`;
  return '';
}

function renderComposeLogPane(itemId: string, state: WebviewState, logRoot: string): string {
  const key = getComposeLogKey(itemId);
  if (!key) return 'Select a project or service to view logs.';

  const entries = state.composeLogs.get(key);
  if (!entries || entries.length === 0) {
    return '<div class="empty-state"><div class="empty-icon">\u{1F4DC}</div><div class="empty-title">No logs yet</div><div class="empty-subtitle">Logs will appear as the service produces output</div></div>';
  }
  const first = entries[0];
  return `<div class="log-shell" data-log-root="${logRoot}" data-item-id="${escapeHtml(key)}" data-rendered-count="${entries.length}" data-first-key="${escapeHtml(`${first?.timestamp ?? ''}:${first?.stream ?? ''}:${first?.message ?? ''}`)}"><div class="log-content" data-log-content>${entries.map(e => colorizeLogEntry(e)).join('')}</div></div>`;
}

export const servicesPanel: PanelDefinition = {
  id: 'services',
  title: 'Services',
  shortcutKey: 2,

  detailTabs: [
    {
      label: 'Info',
      render: (item: PanelItem, state: WebviewState): string => {
        if (!state.snapshot) return '';
        // Parse item id: "project:name" or "service:project:name"
        const parts = item.id.split(':');
        if (parts[0] === 'project') {
          const projectName = parts.slice(1).join(':');
          const project = state.snapshot.composeProjects.find(p => p.name === projectName);
          if (!project) return 'Project not found.';
          let html = renderKvGrid([
            ['Project', escapeHtml(project.name)],
            ['Status', colorizeState(project.status)],
            ['Services', escapeHtml(String(project.services.length))],
          ]);
          html += '<div style="margin-top:10px;">';
          for (const s of project.services) {
            html += `<div>${stateIcon(s.state)} ${escapeHtml(s.name)} (${escapeHtml(s.image)})</div>`;
          }
          html += '</div>';
          return html;
        }
        if (parts[0] === 'service') {
          const projectName = parts[1];
          const serviceName = parts.slice(2).join(':');
          const project = state.snapshot.composeProjects.find(p => p.name === projectName);
          const service = project?.services.find(s => s.name === serviceName);
          if (!service) return 'Service not found.';
          return renderKvGrid([
            ['Service', escapeHtml(service.name)],
            ['Project', escapeHtml(service.projectName)],
            ['Image', escapeHtml(service.image)],
            ['State', colorizeState(service.state)],
            ['Container', service.containerId ? colorizeId(service.containerId) : 'not created'],
            ['Ports', escapeHtml(service.ports.join(', ') || 'none')],
          ]);
        }
        return 'No compose projects detected.\n\nCompose projects are detected from container labels\n(com.docker.compose.project) or from a compose file in the CWD.';
      },
    },
    {
      label: 'Logs',
      render: (item: PanelItem, state: WebviewState): string => {
        const compareItemId = state.compareItemIds['services'] ?? null;

        if (!compareItemId) {
          return renderComposeLogPane(item.id, state, 'compose');
        }

        // Compare mode: side-by-side
        const primaryLabel = item.label.trim();
        const secondaryLabel = compareItemId.replace(/^(project|service):/, '').replace(/:/g, '/');

        return `<div class="log-compare-container">
          <div class="log-compare-pane" data-compare="primary">
            <div class="compare-label">${escapeHtml(primaryLabel)}</div>
            ${renderComposeLogPane(item.id, state, 'compose')}
          </div>
          <div class="log-compare-divider"></div>
          <div class="log-compare-pane" data-compare="secondary">
            <div class="compare-label">${escapeHtml(secondaryLabel)}</div>
            ${renderComposeLogPane(compareItemId, state, 'compose-compare')}
          </div>
        </div>`;
      },
      autoScrollBottom: true,
    },
  ] as DetailTabDefinition[],

  getItems(snapshot: DashboardStateSnapshot): PanelItem[] {
    const items: PanelItem[] = [];
    let sortKey = 0;

    for (const project of snapshot.composeProjects) {
      const statusIcon = project.status === 'running' ? '\u25B6' : project.status === 'partial' ? '\u25B7' : '\u25A0';
      items.push({
        id: `project:${project.name}`,
        label: project.name,
        icon: statusIcon,
        iconColor: project.status === 'running' ? stateColor('running') : stateColor('exited'),
        sortKey: sortKey++,
        tooltip: project.name,
      });

      for (const service of project.services) {
        items.push({
          id: `service:${project.name}:${service.name}`,
          label: `  ${service.name}`,
          icon: stateIcon(service.state),
          iconColor: stateColor(service.state),
          sortKey: sortKey++,
          tooltip: `${project.name}/${service.name}`,
        });
      }
    }

    if (items.length === 0) {
      items.push({
        id: 'no-services',
        label: 'No compose projects found',
        icon: '',
        iconColor: '',
        sortKey: 0,
      });
    }

    return items;
  },

  getActions(item: PanelItem): ActionDefinition[] {
    if (item.id === 'no-services') return [];
    return [
      { key: 'u', label: 'Up', actionType: 'up' },
      { key: 'D', label: 'Down', actionType: 'down', confirm: true, confirmMessage: 'Bring down this compose project?' },
      { key: 'r', label: 'Restart', actionType: 'restart' },
      { key: 'S', label: 'Stop', actionType: 'stop' },
      { key: 'c', label: 'Copy Logs', actionType: 'copyLogs' },
    ];
  },

  getSearchableText(item: PanelItem, snapshot: DashboardStateSnapshot): string {
    const parts = item.id.split(':');
    if (parts[0] === 'project') return parts.slice(1).join(':');
    if (parts[0] === 'service') {
      const projectName = parts[1];
      const serviceName = parts.slice(2).join(':');
      const project = snapshot.composeProjects.find(p => p.name === projectName);
      const service = project?.services.find(s => s.name === serviceName);
      return service ? `${service.projectName} ${service.name} ${service.image}` : item.label;
    }
    return '';
  },
};
