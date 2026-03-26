import type { ComposeService, ComposeProject } from 'sidekick-docker-shared';
import { ComposeClient, filterLine } from 'sidekick-docker-shared';
import type { DockerDashboardMetrics } from '../DockerState';
import { defaultOnError, panelData } from './types';
import type { SidePanel, PanelItem, PanelAction, DetailTab } from './types';
import { stateIcon, stateColor, truncate, colorizeDetailKey, colorizeState, colorizeId, renderLogLines } from '../../formatters';

type ServiceItemData =
  | { type: 'project'; project: ComposeProject }
  | { type: 'service'; service: ComposeService };

function getProjectName(d: ServiceItemData): string {
  return d.type === 'project' ? d.project.name : d.service.projectName;
}

export class ServicesPanel implements SidePanel {
  readonly id = 'services';
  readonly title = 'Services';
  readonly shortcutKey = 2;

  private composeClient: ComposeClient;
  private onAction: () => void;
  private onError: (msg: string) => void;
  private cwd: string | undefined;
  private onCopyLogs?: (text: string) => void;
  private lastMetrics: DockerDashboardMetrics | null = null;

  constructor(composeClient: ComposeClient, onAction: () => void, cwd?: string, onError?: (msg: string) => void) {
    this.composeClient = composeClient;
    this.onAction = onAction;
    this.onError = onError ?? defaultOnError;
    this.cwd = cwd;
  }

  setOnCopyLogs(handler: (text: string) => void): void {
    this.onCopyLogs = handler;
  }

  readonly detailTabs: DetailTab[] = [
    {
      label: 'Info',
      render: (item) => {
        if (!item.data) return 'No compose projects detected.\n\nCompose projects are detected from container labels\n(com.docker.compose.project) or from a compose file in the CWD.';
        const d = panelData<ServiceItemData>(item);
        if (d.type === 'project') {
          const p = d.project;
          const lines = [
            colorizeDetailKey(`Project:  ${p.name}`),
            colorizeDetailKey(`Status:   ${colorizeState(p.status)}`),
            colorizeDetailKey(`Services: ${p.services.length}`),
            '',
            ...p.services.map(s => `  ${stateIcon(s.state)} ${s.name} (${s.image})`),
          ];
          return lines.join('\n');
        }
        const s = d.service;
        return [
          colorizeDetailKey(`Service:   ${s.name}`),
          colorizeDetailKey(`Project:   ${s.projectName}`),
          colorizeDetailKey(`Image:     ${s.image}`),
          colorizeDetailKey(`State:     ${colorizeState(s.state)}`),
          colorizeDetailKey(`Container: ${s.containerId ? colorizeId(s.containerId) : 'not created'}`),
          colorizeDetailKey(`Ports:     ${s.ports.join(', ') || 'none'}`),
        ].join('\n');
      },
    },
    {
      label: 'Logs',
      render: (_item, metrics) => {
        const logs = metrics.selectedComposeLogs;
        if (logs.length === 0) return 'No compose logs. Logs will appear when a service produces output.';
        return renderLogLines(logs, metrics.logFilterString, metrics.logFilterMode).join('\n');
      },
      autoScrollBottom: true,
    },
  ];

  getItems(metrics: DockerDashboardMetrics): PanelItem[] {
    this.lastMetrics = metrics;
    const items: PanelItem[] = [];
    let sortKey = 0;

    for (const project of metrics.composeProjects) {
      // Project header
      const statusIcon = project.status === 'running' ? '\u25B6' : project.status === 'partial' ? '\u25B7' : '\u25A0';
      const projectIconColor = project.status === 'running' ? 'green' : project.status === 'partial' ? 'yellow' : 'red';
      const runCount = project.services.filter(s => s.state === 'running').length;
      items.push({
        id: `project:${project.name}`,
        label: `${statusIcon} ${project.name}`,
        sortKey: sortKey++,
        data: { type: 'project' as const, project },
        iconColor: projectIconColor,
        rightLabel: `${runCount}/${project.services.length}`,
        rightColor: projectIconColor,
      });

      // Services under project
      for (const service of project.services) {
        const icon = stateIcon(service.state);
        items.push({
          id: `service:${project.name}:${service.name}`,
          label: `  ${icon} ${truncate(service.name, 36)}`,
          sortKey: sortKey++,
          data: { type: 'service' as const, service },
          iconColor: stateColor(service.state),
        });
      }
    }

    if (items.length === 0) {
      items.push({
        id: 'no-services',
        label: '  No compose projects found',
        sortKey: 0,
        data: null,
      });
    }

    return items;
  }

  getActions(): PanelAction[] {
    return [
      {
        key: 'u',
        label: 'Up',
        handler: (item) => {
          const d = panelData<ServiceItemData>(item);
          return this.composeClient.up(getProjectName(d), this.cwd).then(() => { this.onAction(); });
        },
        condition: (item) => item.data !== null,
      },
      {
        key: 'D',
        label: 'Down',
        confirm: true,
        confirmMessage: 'Bring down this compose project?',
        confirmSeverity: 'high',
        handler: (item) => {
          const d = panelData<ServiceItemData>(item);
          return this.composeClient.down(getProjectName(d), this.cwd).then(() => { this.onAction(); });
        },
        condition: (item) => item.data !== null,
      },
      {
        key: 'r',
        label: 'Restart',
        handler: (item) => {
          const d = panelData<ServiceItemData>(item);
          if (d.type === 'service') {
            return this.composeClient.restart(d.service.projectName, d.service.name, this.cwd).then(() => { this.onAction(); });
          }
          return this.composeClient.restart(d.project.name, undefined, this.cwd).then(() => { this.onAction(); });
        },
        condition: (item) => item.data !== null,
      },
      {
        key: 'S',
        label: 'Stop',
        handler: (item) => {
          const d = panelData<ServiceItemData>(item);
          if (d.type === 'service') {
            return this.composeClient.stop(d.service.projectName, d.service.name, this.cwd).then(() => { this.onAction(); });
          }
          return this.composeClient.stop(d.project.name, undefined, this.cwd).then(() => { this.onAction(); });
        },
        condition: (item) => item.data !== null,
      },
      {
        key: 'c',
        label: 'Copy Logs',
        handler: () => {
          if (!this.lastMetrics || !this.onCopyLogs) return;
          const logs = this.lastMetrics.selectedComposeLogs;
          const query = this.lastMetrics.logFilterString;
          const mode = this.lastMetrics.logFilterMode;
          let lines: string[];
          if (query) {
            lines = logs
              .filter(l => filterLine(l.message, query, mode).matched)
              .map(l => l.message);
          } else {
            lines = logs.map(l => l.message);
          }
          this.onCopyLogs(lines.join('\n'));
        },
      },
    ];
  }

  getSearchableText(item: PanelItem): string {
    if (!item.data) return '';
    const d = panelData<ServiceItemData>(item);
    if (d.type === 'project') return d.project.name;
    return `${d.service.projectName} ${d.service.name} ${d.service.image}`;
  }
}
