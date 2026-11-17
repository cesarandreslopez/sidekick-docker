import type { PanelDefinition, PanelItem, ActionDefinition, DetailTabDefinition } from './types';
import type { DashboardStateSnapshot } from '../../types/messages';
import type { WebviewState } from '../state';
import { parseComposeItemId, composeProjectNameOf } from '../../types/composeItemId';
import { composeDownConfirmMessage, emptyLogMessage } from 'sidekick-docker-shared/formatters';
import { stateIcon, stateColor, escapeHtml, escapeAttr, colorizeState, colorizeId, renderKvGrid } from '../formatters';
import { renderLogFilterBar, renderLogLines, renderEmptyLogPane, NO_MATCHING_LOGS } from './logPane';

function getComposeLogKey(itemId: string): string {
  const ref = parseComposeItemId(itemId);
  if (ref.kind === 'project') return ref.projectName;
  if (ref.kind === 'service') return `${ref.projectName}:${ref.serviceName}`;
  return '';
}

function renderComposeLogPane(itemId: string, state: WebviewState, logRoot: string): string {
  const key = getComposeLogKey(itemId);
  if (!key) return 'Select a project or service to view logs.';

  const entries = state.composeLogs.get(key);
  if (!entries || entries.length === 0) {
    return renderEmptyLogPane(emptyLogMessage(state.streamStates.get(`composeLogs:${key}`)?.state ?? null, 'service'));
  }
  const lines = renderLogLines(entries, state);
  // The primary pane gets the same filter bar as Containers (the TUI filters
  // Services logs too); Copy Logs applies the filter that is on screen.
  const bar = logRoot === 'compose' ? renderLogFilterBar(state, lines.matched) : '';
  return `<div class="log-shell" data-log-root="${logRoot}" data-item-id="${escapeAttr(key)}">${bar}<div class="log-content" data-log-content>${lines.html || NO_MATCHING_LOGS}</div></div>`;
}

const COMPOSE_UNTRUSTED_NOTE = '<div class="detail-note">Compose actions are disabled until this workspace is trusted.</div>';

export const servicesPanel: PanelDefinition = {
  id: 'services',
  title: 'Services',
  shortcutKey: 2,

  detailTabs: [
    {
      label: 'Info',
      render: (item: PanelItem, state: WebviewState): string => {
        if (!state.snapshot) return '';
        const ref = parseComposeItemId(item.id);
        if (ref.kind === 'project') {
          const project = state.snapshot.composeProjects.find(p => p.name === ref.projectName);
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
          if (state.snapshot.composeAllowed === false) html += COMPOSE_UNTRUSTED_NOTE;
          return html;
        }
        if (ref.kind === 'service') {
          const project = state.snapshot.composeProjects.find(p => p.name === ref.projectName);
          const service = project?.services.find(s => s.name === ref.serviceName);
          if (!service) return 'Service not found.';
          const note = state.snapshot.composeAllowed === false ? COMPOSE_UNTRUSTED_NOTE : '';
          return renderKvGrid([
            ['Service', escapeHtml(service.name)],
            ['Project', escapeHtml(service.projectName)],
            ['Image', escapeHtml(service.image)],
            ['State', colorizeState(service.state)],
            ['Replicas', `${service.runningReplicas ?? (service.state === 'running' ? 1 : 0)}/${service.totalReplicas ?? (service.containerId ? 1 : 0)} running`],
            ['Container', service.containerId ? colorizeId(service.containerId) : 'not created'],
            ['Ports', escapeHtml(service.ports.join(', ') || 'none')],
          ]) + note;
        }
        return '';
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
        const primaryLabel = item.label;
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
        // Partial is a warning (some services down), as in the TUI — not an error.
        iconColor: project.status === 'running' ? stateColor('running') : project.status === 'partial' ? stateColor('paused') : stateColor('exited'),
        sortKey: sortKey++,
        tooltip: project.name,
        stateText: project.status,
      });

      for (const service of project.services) {
        items.push({
          id: `service:${project.name}:${service.name}`,
          label: service.name,
          indent: true,
          icon: stateIcon(service.state),
          iconColor: stateColor(service.state),
          sortKey: sortKey++,
          tooltip: `${project.name}/${service.name}`,
          stateText: service.state.replace('_', ' '),
          badge: `${service.runningReplicas ?? (service.state === 'running' ? 1 : 0)}/${service.totalReplicas ?? (service.containerId ? 1 : 0)}`,
        });
      }
    }

    return items;
  },

  getActions(item: PanelItem, snapshot: DashboardStateSnapshot): ActionDefinition[] {
    const copyLogs: ActionDefinition = { key: 'c', label: 'Copy Logs', actionType: 'copyLogs' };
    // The host refuses compose in an untrusted workspace; do not offer what
    // would only fail after the confirm.
    if (snapshot.composeAllowed === false) return [copyLogs];
    // Up/Down target the whole project, even from a service row.
    const projectName = composeProjectNameOf(item.id) ?? item.label;
    return [
      { key: 'u', label: 'Up', actionType: 'up' },
      { key: 'D', label: 'Down', actionType: 'down', confirm: true, confirmMessage: composeDownConfirmMessage(projectName), confirmSeverity: 'high' },
      { key: 'r', label: 'Restart', actionType: 'restart' },
      { key: 'S', label: 'Stop', actionType: 'stop' },
      copyLogs,
    ];
  },

  getSearchableText(item: PanelItem, snapshot: DashboardStateSnapshot): string {
    const ref = parseComposeItemId(item.id);
    if (ref.kind === 'project') return ref.projectName;
    if (ref.kind === 'service') {
      const project = snapshot.composeProjects.find(p => p.name === ref.projectName);
      const service = project?.services.find(s => s.name === ref.serviceName);
      return service ? `${service.projectName} ${service.name} ${service.image}` : item.label;
    }
    return '';
  },
};
