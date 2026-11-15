import type { ContainerInfo, ContainerDetails } from 'sidekick-docker-shared';
import { DockerClient, shortId, publishedPortUrls, summarizeHealth, summarizeRestartPolicy, formatMount, canStart, canStop, pruneConfirmFor, pruneResultText, removeContainerConfirmMessage, actionText } from 'sidekick-docker-shared';
import type { DockerDashboardMetrics } from '../DockerState';
import { DockerState } from '../DockerState';
import { panelData, detailFetchError, copyLogsAction } from './types';
import type { SidePanel, PanelItem, PanelAction, DetailTab } from './types';
import { stateIcon, stateColor, formatPorts, formatBytes, formatMemory, truncate, colorizeEnvLine, colorizeDetailKey, colorizeState, colorizeId, colorizePercent, colorizeHealth, compactUptime, sectionHeader, ansi, formatFileChange, formatLogTemplate, coloredSparkline, severitySparkline, renderLogLines } from '../../formatters';

/** Exit status and health detail (inspect-only) for the Config tab's Status section. */
function configStatusDetails(c: ContainerInfo, d: ContainerDetails | undefined): string[] {
  if (!d) return [];
  const lines: string[] = [];
  if (c.state === 'exited' || c.state === 'dead') {
    const why = [d.oomKilled ? ansi.red('OOM killed') : '', d.error].filter(Boolean).join(' · ');
    lines.push(colorizeDetailKey(`  Exit:    ${d.exitCode === 0 ? '0' : ansi.red(String(d.exitCode))}${why ? `  ${why}` : ''}`));
  }
  summarizeHealth(d.health).forEach((line, i) => {
    lines.push(i === 0 ? colorizeDetailKey(`  Checks:  ${line}`) : `           ${ansi.gray(line)}`);
  });
  return lines;
}

/** Restart policy and mounts, which only `inspect` reports. */
function configInspectSections(d: ContainerDetails | undefined, failure: string | undefined): string[] {
  if (failure) return ['', ansi.gray(`  Restart policy and mounts unavailable: ${failure}`)];
  if (!d) return ['', ansi.gray('  Loading restart policy and mounts…')];
  return [
    '',
    sectionHeader('Runtime'),
    colorizeDetailKey(`  Restart: ${summarizeRestartPolicy(d.restartPolicy, d.restartCount)}`),
    '',
    sectionHeader(`Mounts (${d.mounts.length})`),
    ...(d.mounts.length ? d.mounts.map(m => `  ${formatMount(m)}`) : [ansi.gray('  none')]),
  ];
}

export class ContainersPanel implements SidePanel {
  readonly id = 'containers';
  readonly title = 'Containers';
  readonly shortcutKey = 1;

  private client: DockerClient;
  private onAction: () => void;
  private onExec?: (containerId: string) => void;
  private onCopyLogs?: (text: string) => boolean;
  private onOpenUrl?: (url: string) => Promise<void>;
  /** Where published ports are reachable: the daemon's host (see browserHostForEndpoint). */
  private browserHost = 'localhost';
  private lastMetrics: DockerDashboardMetrics | null = null;

  constructor(client: DockerClient, onAction: () => void) {
    this.client = client;
    this.onAction = onAction;
  }

  setOnExec(handler: (containerId: string) => void): void {
    this.onExec = handler;
  }

  setOnCopyLogs(handler: (text: string) => boolean): void {
    this.onCopyLogs = handler;
  }

  setOnOpenUrl(handler: (url: string) => Promise<void>, browserHost: string): void {
    this.onOpenUrl = handler;
    this.browserHost = browserHost;
  }

  readonly detailTabs: DetailTab[] = [
    {
      label: 'Logs',
      render: (_item, metrics) => {
        const logs = metrics.selectedContainerLogs;
        if (logs.length === 0) return ['No logs available. Select a container to view logs.'];
        return renderLogLines(logs, metrics.logFilterString, metrics.logFilterMode, metrics.logSeverityCounts);
      },
      autoScrollBottom: true,
    },
    {
      label: 'Stats',
      render: (item, metrics) => {
        const c = panelData<ContainerInfo>(item);
        if (c.state !== 'running') return 'Container is not running.';

        const latest = metrics.statsCollector.getLatest(c.id);
        if (!latest) {
          return 'Loading stats...';
        }

        const cpuSeries = metrics.statsCollector.getCpuSeries(c.id);
        const memSeries = metrics.statsCollector.getMemorySeries(c.id);

        const lines = [
          colorizeDetailKey(`CPU:    ${colorizePercent(latest.cpuPercent)}`),
        ];
        if (cpuSeries.length > 1) {
          lines.push(`        ${coloredSparkline(cpuSeries, 'cpu')}`);
        }
        lines.push(colorizeDetailKey(`Memory: ${formatMemory(latest.memoryUsage, latest.memoryLimit)} (${colorizePercent(latest.memoryPercent)})`));
        if (memSeries.length > 1) {
          lines.push(`        ${coloredSparkline(memSeries, 'memory')}`);
        }
        lines.push(
          colorizeDetailKey(`Net:    \u25BC ${formatBytes(latest.networkRx)}  \u25B2 ${formatBytes(latest.networkTx)}`),
        );
        const rxRates = metrics.statsCollector.getNetworkRxRateSeries(c.id);
        const txRates = metrics.statsCollector.getNetworkTxRateSeries(c.id);
        if (rxRates.length > 1) {
          lines.push(`        \u25BC ${coloredSparkline(rxRates, 'cpu')}  \u25B2 ${coloredSparkline(txRates, 'memory')}`);
        }
        lines.push(
          colorizeDetailKey(`IO:     R ${formatBytes(latest.blockRead)}  W ${formatBytes(latest.blockWrite)}`),
        );
        const brRates = metrics.statsCollector.getBlockReadRateSeries(c.id);
        const bwRates = metrics.statsCollector.getBlockWriteRateSeries(c.id);
        if (brRates.length > 1) {
          lines.push(`        R ${coloredSparkline(brRates, 'cpu')}  W ${coloredSparkline(bwRates, 'memory')}`);
        }
        lines.push(
          colorizeDetailKey(`PIDs:   ${latest.pids}`),
        );

        // Severity time-series sparkline
        if (metrics.logSeverityTimeSeries.length > 1) {
          lines.push('');
          lines.push(sectionHeader('Log Activity'));
          lines.push(`        ${severitySparkline(metrics.logSeverityTimeSeries)}`);
        }

        return lines.join('\n');
      },
    },
    {
      label: 'Env',
      render: (item, metrics) => {
        const c = panelData<ContainerInfo>(item);
        const failure = metrics.detailErrors.get(DockerState.detailErrorKey('details', c.id));
        if (failure) return detailFetchError('environment variables', failure);
        const env = metrics.containerDetails.get(c.id)?.env;
        if (!env) return 'Loading environment variables...';
        if (env.length === 0) return 'No environment variables set.';
        return env.sort().map(l => colorizeEnvLine(l)).join('\n');
      },
    },
    {
      label: 'Config',
      render: (item, metrics) => {
        const c = panelData<ContainerInfo>(item);
        const details = metrics.containerDetails.get(c.id);
        const detailFailure = metrics.detailErrors.get(DockerState.detailErrorKey('details', c.id));
        const lines = [
          sectionHeader('Identity'),
          colorizeDetailKey(`  ID:      ${colorizeId(shortId(c.id))}`),
          colorizeDetailKey(`  Name:    ${c.name}`),
          colorizeDetailKey(`  Image:   ${c.image}`),
          '',
          sectionHeader('Status'),
          colorizeDetailKey(`  State:   ${colorizeState(c.state)}`),
          colorizeDetailKey(`  Status:  ${c.status}`),
          ...(c.healthStatus ? [colorizeDetailKey(`  Health:  ${colorizeHealth(c.healthStatus)}`)] : []),
          colorizeDetailKey(`  Created: ${c.created.toLocaleString()}`),
          ...configStatusDetails(c, details),
          '',
          sectionHeader('Network'),
          colorizeDetailKey(`  Ports:   ${formatPorts(c.ports)}`),
          ...configInspectSections(details, detailFailure),
        ];
        if (c.composeProject) {
          lines.push('', sectionHeader('Compose'));
          lines.push(colorizeDetailKey(`  Project: ${c.composeProject}`));
          lines.push(colorizeDetailKey(`  Service: ${c.composeService}`));
        }
        return lines.join('\n');
      },
    },
    {
      // labels arrive on every listContainers call and were displayed nowhere,
      // even though they are how compose projects, orchestrators and image
      // provenance are all identified.
      label: 'Labels',
      render: (item) => {
        const c = panelData<ContainerInfo>(item);
        const keys = Object.keys(c.labels ?? {}).sort();
        if (keys.length === 0) return 'No labels set.';
        const lines = [sectionHeader(`Labels (${keys.length})`), ''];
        for (const k of keys) {
          lines.push(`  ${colorizeEnvLine(`${k}=${c.labels?.[k] ?? ''}`)}`);
        }
        return lines.join('\n');
      },
    },
    {
      label: 'Files',
      render: (item, metrics) => {
        const c = panelData<ContainerInfo>(item);
        const failure = metrics.detailErrors.get(DockerState.detailErrorKey('changes', c.id));
        if (failure) return detailFetchError('filesystem changes', failure);
        const changes = metrics.containerChanges.get(c.id);
        if (!changes) return 'Loading filesystem changes...';
        if (changes.length === 0) return 'No filesystem changes detected.';
        const lines = [sectionHeader(`Filesystem Changes (${changes.length} files)`), ''];
        for (const change of changes) lines.push(formatFileChange(change));
        return lines.join('\n');
      },
    },
    {
      label: 'Patterns',
      render: (_item, metrics) => {
        const templates = metrics.logTemplates;
        if (templates.length === 0) return 'No log patterns detected yet. Patterns will appear as logs stream in.';

        const lines = [sectionHeader('Top Log Patterns'), ''];
        for (const t of templates) lines.push(formatLogTemplate(t));
        return lines.join('\n');
      },
    },
  ];

  getItems(metrics: DockerDashboardMetrics): PanelItem[] {
    this.lastMetrics = metrics;
    return metrics.containers.map((c): PanelItem => {
      const uptime = compactUptime(c.status);
      // Show first exposed port as a hint
      const portHint = c.state === 'running' && c.ports.length > 0
        ? `:${c.ports[0].hostPort || c.ports[0].containerPort}`
        : '';
      const healthBadge = c.healthStatus ? ` ${colorizeHealth(c.healthStatus)}` : '';
      const namePart = portHint
        ? `${truncate(c.name, 34)} ${portHint}`
        : truncate(c.name, 38);
      return {
        id: c.id,
        label: `${stateIcon(c.state)} ${namePart}${healthBadge}`,
        sortKey: c.state === 'running' ? 0 : 1,
        data: c,
        iconColor: stateColor(c.state),
        rightLabel: uptime,
        rightColor: c.state === 'running' ? 'green' : 'gray',
      };
    });
  }

  getActions(): PanelAction[] {
    return [
      {
        key: 's',
        label: 'Start',
        handler: (item) => {
          const c = panelData<ContainerInfo>(item);
          return this.client.startContainer(c.id).then(() => { this.onAction(); return actionText('start', c.name).success; });
        },
        // Not for paused containers: Docker rejects start; they need unpause.
        condition: (item) => canStart(panelData<ContainerInfo>(item).state),
      },
      {
        key: 'S',
        label: 'Stop',
        handler: (item) => {
          const c = panelData<ContainerInfo>(item);
          return this.client.stopContainer(c.id).then(() => { this.onAction(); return actionText('stop', c.name).success; });
        },
        // Paused and restarting containers can be stopped too.
        condition: (item) => canStop(panelData<ContainerInfo>(item).state),
      },
      {
        key: 'r',
        label: 'Restart',
        handler: (item) => {
          const c = panelData<ContainerInfo>(item);
          return this.client.restartContainer(c.id).then(() => { this.onAction(); return actionText('restart', c.name).success; });
        },
        condition: (item) => panelData<ContainerInfo>(item).state === 'running',
      },
      {
        key: 'p',
        label: 'Pause',
        handler: (item) => {
          const c = panelData<ContainerInfo>(item);
          return this.client.pauseContainer(c.id).then(() => { this.onAction(); return actionText('pause', c.name).success; });
        },
        condition: (item) => panelData<ContainerInfo>(item).state === 'running',
      },
      {
        key: 'u',
        label: 'Unpause',
        handler: (item) => {
          const c = panelData<ContainerInfo>(item);
          return this.client.unpauseContainer(c.id).then(() => { this.onAction(); return actionText('unpause', c.name).success; });
        },
        condition: (item) => panelData<ContainerInfo>(item).state === 'paused',
      },
      {
        key: 'd',
        label: 'Remove',
        confirm: true,
        confirmMessage: (item) => removeContainerConfirmMessage(panelData<ContainerInfo>(item)),
        confirmSeverity: 'high',
        handler: (item) => {
          const c = panelData<ContainerInfo>(item);
          return this.client.removeContainer(c.id, true).then(() => { this.onAction(); return actionText('remove', c.name).success; });
        },
      },
      {
        key: 'e',
        label: 'Exec',
        handler: (item) => {
          const c = panelData<ContainerInfo>(item);
          this.onExec?.(c.id);
        },
        condition: (item) => panelData<ContainerInfo>(item).state === 'running',
      },
      {
        // Images, volumes and networks all had a prune; containers did not,
        // even though clearing stopped containers is the most routine cleanup.
        key: 'P',
        label: 'Prune',
        confirm: true,
        confirmMessage: () => pruneConfirmFor('containers', this.lastMetrics?.containers ?? []),
        confirmSeverity: 'batch',
        handler: () => {
          return this.client.pruneContainers().then((r) => {
            this.onAction();
            return pruneResultText('containers', { spaceReclaimed: r.spaceReclaimed, deleted: r.containersDeleted.length });
          });
        },
      },
      {
        key: 'b',
        label: 'Open in Browser',
        handler: (item) => {
          const c = panelData<ContainerInfo>(item);
          const [first, ...rest] = publishedPortUrls(c.ports, this.browserHost);
          if (!first || !this.onOpenUrl) return;
          return this.onOpenUrl(first).then(() => (rest.length ? `Opened ${first} (also published: ${rest.join(', ')})` : `Opened ${first}`));
        },
        condition: (item) => {
          const c = panelData<ContainerInfo>(item);
          return c.state === 'running' && publishedPortUrls(c.ports, this.browserHost).length > 0;
        },
      },
      copyLogsAction(() => this.lastMetrics, m => m.selectedContainerLogs, () => this.onCopyLogs),
    ];
  }

  getSearchableText(item: PanelItem): string {
    const c = panelData<ContainerInfo>(item);
    return `${c.name} ${c.image} ${c.state}`;
  }
}
