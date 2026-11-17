import type { ComposeService, ComposeProject, ComposeExecResult, ComposeCommandOptions } from 'sidekick-docker-shared';
import type { ActionType } from 'sidekick-docker-shared';
import { ComposeClient, throwIfComposeFailed, resolveComposeOptions, composeDownConfirmMessage, actionText, emptyLogMessage } from 'sidekick-docker-shared';
import type { DockerDashboardMetrics } from '../DockerState';
import { panelData, copyLogsAction } from './types';
import type { SidePanel, PanelItem, PanelAction, DetailTab } from './types';
import { stateIcon, stateColor, colorizeDetailKey, colorizeState, colorizeId, renderLogLines } from '../../formatters';

type ServiceItemData =
  | { type: 'project'; project: ComposeProject }
  | { type: 'service'; service: ComposeService };

function getProjectName(d: ServiceItemData): string {
  return d.type === 'project' ? d.project.name : d.service.projectName;
}

/** What Restart/Stop act on: the service on a service row, else the whole project. */
function getTargetName(d: ServiceItemData): string {
  return d.type === 'service' ? d.service.name : d.project.name;
}

/** Positions of the Services detail tabs (see CONTAINER_TAB). */
export const SERVICE_TAB = { info: 0, logs: 1 } as const;

export class ServicesPanel implements SidePanel {
  readonly id = 'services';
  readonly title = 'Services';
  readonly shortcutKey = 2;

  private composeClient: ComposeClient;
  private onAction: () => void;
  private cwd: string | undefined;
  private onCopyLogs?: (text: string) => boolean;
  private lastMetrics: DockerDashboardMetrics | null = null;

  constructor(composeClient: ComposeClient, onAction: () => void, cwd?: string) {
    this.composeClient = composeClient;
    this.onAction = onAction;
    this.cwd = cwd;
  }

  setOnCopyLogs(handler: (text: string) => boolean): void {
    this.onCopyLogs = handler;
  }

  readonly detailTabs: DetailTab[] = [
    {
      label: 'Info',
      render: (item) => {
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
          colorizeDetailKey(`Replicas:  ${s.runningReplicas ?? Number(s.state === 'running')}/${s.totalReplicas ?? Number(!!s.containerId)} running`),
          colorizeDetailKey(`Container: ${s.containerId ? colorizeId(s.containerId) : 'not created'}`),
          colorizeDetailKey(`Ports:     ${s.ports.join(', ') || 'none'}`),
        ].join('\n');
      },
    },
    {
      label: 'Logs',
      render: (_item, metrics) => {
        const logs = metrics.selectedComposeLogs;
        if (logs.length === 0) return [emptyLogMessage(metrics.composeLogStreamState, 'service')];
        return renderLogLines(logs, metrics.logFilterString, metrics.logFilterMode, null, { timestamps: metrics.logTimestamps !== false });
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
        name: project.name,
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
          label: `  ${icon} ${service.name}`,
          name: service.name,
          sortKey: sortKey++,
          data: { type: 'service' as const, service },
          iconColor: stateColor(service.state),
          rightLabel: `${service.runningReplicas ?? Number(service.state === 'running')}/${service.totalReplicas ?? Number(!!service.containerId)}`,
        });
      }
    }

    // No placeholder row: it hid the side list's empty / connecting /
    // disconnected states and counted as "Services (1)".
    return items;
  }

  /**
   * Directory to run this project's compose command in.
   *
   * The panel used to pass a single cwd captured at construction — the
   * process's own working directory — for every project. Running the TUI from
   * ~ and hitting Up on a project created in ~/work/api ran compose in the
   * wrong place. Resolve from the project's own recorded location instead.
   */
  private cwdFor(d: ServiceItemData): ComposeCommandOptions {
    const projectName = getProjectName(d);
    const project = d.type === 'project'
      ? d.project
      : this.lastMetrics?.composeProjects.find(p => p.name === projectName);
    return resolveComposeOptions(project, this.cwd);
  }

  /**
   * Await a compose run and raise on a non-zero exit.
   *
   * ComposeExecResult carries exitCode and stderr, but every call site used to
   * drop it — so a `docker compose up` that failed still rendered the success
   * toast. executeAction turns a rejection into an error toast, so throwing is
   * all that is needed here.
   */
  private async runCompose(action: string, exec: Promise<ComposeExecResult>, type: ActionType, name: string): Promise<string> {
    throwIfComposeFailed(await exec, action);
    this.onAction();
    return actionText(type, name).success;
  }

  getActions(): PanelAction[] {
    return [
      {
        key: 'u',
        label: 'Up',
        handler: (item) => {
          const d = panelData<ServiceItemData>(item);
          return this.runCompose('Up', this.composeClient.up(getProjectName(d), this.cwdFor(d)), 'up', getProjectName(d));
        },
        condition: (item) => item.data !== null,
        // Up and Down act on the whole project, even from a service row.
        actionType: 'up',
        targetName: (item) => getProjectName(panelData<ServiceItemData>(item)),
      },
      {
        key: 'D',
        label: 'Down',
        confirm: true,
        confirmMessage: (item) => composeDownConfirmMessage(getProjectName(panelData<ServiceItemData>(item))),
        confirmSeverity: 'high',
        handler: (item) => {
          const d = panelData<ServiceItemData>(item);
          return this.runCompose('Down', this.composeClient.down(getProjectName(d), this.cwdFor(d)), 'down', getProjectName(d));
        },
        condition: (item) => item.data !== null,
        actionType: 'down',
        targetName: (item) => getProjectName(panelData<ServiceItemData>(item)),
      },
      {
        key: 'r',
        label: 'Restart',
        handler: (item) => {
          const d = panelData<ServiceItemData>(item);
          return this.runCompose('Restart', d.type === 'service'
            ? this.composeClient.restart(d.service.projectName, d.service.name, this.cwdFor(d))
            : this.composeClient.restart(d.project.name, undefined, this.cwdFor(d)), 'restart', getTargetName(d));
        },
        condition: (item) => item.data !== null,
        actionType: 'restart',
        targetName: (item) => getTargetName(panelData<ServiceItemData>(item)),
      },
      {
        key: 'S',
        label: 'Stop',
        handler: (item) => {
          const d = panelData<ServiceItemData>(item);
          return this.runCompose('Stop', d.type === 'service'
            ? this.composeClient.stop(d.service.projectName, d.service.name, this.cwdFor(d))
            : this.composeClient.stop(d.project.name, undefined, this.cwdFor(d)), 'stop', getTargetName(d));
        },
        condition: (item) => item.data !== null,
        actionType: 'stop',
        targetName: (item) => getTargetName(panelData<ServiceItemData>(item)),
      },
      // Compose logs stream only on the Logs tab; Info is the default.
      copyLogsAction(() => this.lastMetrics, m => m.selectedComposeLogs, () => this.onCopyLogs, m => m.composeLogStreamState),
    ];
  }

  getSearchableText(item: PanelItem): string {
    if (!item.data) return '';
    const d = panelData<ServiceItemData>(item);
    if (d.type === 'project') return d.project.name;
    return `${d.service.projectName} ${d.service.name} ${d.service.image}`;
  }
}
