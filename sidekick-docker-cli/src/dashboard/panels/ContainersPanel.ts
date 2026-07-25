import type { ContainerInfo } from 'sidekick-docker-shared';
import { DockerClient, filterLine, shortId } from 'sidekick-docker-shared';
import type { DockerDashboardMetrics } from '../DockerState';
import { DockerState } from '../DockerState';
import { panelData, detailFetchError } from './types';
import type { SidePanel, PanelItem, PanelAction, DetailTab } from './types';
import { stateIcon, stateColor, formatPorts, formatBytes, formatMemory, truncate, colorizeEnvLine, colorizeDetailKey, colorizeState, colorizeId, colorizePercent, colorizeHealth, compactUptime, sectionHeader, coloredSparkline, severitySparkline, renderLogLines } from '../../formatters';

export class ContainersPanel implements SidePanel {
  readonly id = 'containers';
  readonly title = 'Containers';
  readonly shortcutKey = 1;

  private client: DockerClient;
  private onAction: () => void;
  private onExec?: (containerId: string) => void;
  private onCopyLogs?: (text: string) => boolean;
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
        const failure = metrics.detailErrors.get(DockerState.detailErrorKey('env', c.id));
        if (failure) return detailFetchError('environment variables', failure);
        const env = metrics.inspectedEnv.get(c.id);
        if (!env) return 'Loading environment variables...';
        if (env.length === 0) return 'No environment variables set.';
        return env.sort().map(l => colorizeEnvLine(l)).join('\n');
      },
    },
    {
      label: 'Config',
      render: (item) => {
        const c = panelData<ContainerInfo>(item);
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
          '',
          sectionHeader('Network'),
          colorizeDetailKey(`  Ports:   ${formatPorts(c.ports)}`),
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
      label: 'Files',
      render: (item, metrics) => {
        const c = panelData<ContainerInfo>(item);
        const failure = metrics.detailErrors.get(DockerState.detailErrorKey('changes', c.id));
        if (failure) return detailFetchError('filesystem changes', failure);
        const changes = metrics.containerChanges.get(c.id);
        if (!changes) return 'Loading filesystem changes...';
        if (changes.length === 0) return 'No filesystem changes detected.';
        const lines = [sectionHeader(`Filesystem Changes (${changes.length} files)`), ''];
        for (const change of changes) {
          const icon = change.kind === 'added' ? 'A' : change.kind === 'deleted' ? 'D' : 'C';
          const color = change.kind === 'added' ? '\x1b[32m' : change.kind === 'deleted' ? '\x1b[31m' : '\x1b[33m';
          lines.push(`${color} ${icon}\x1b[39m  ${change.path}`);
        }
        return lines.join('\n');
      },
    },
    {
      label: 'Patterns',
      render: (_item, metrics) => {
        const templates = metrics.logTemplates;
        if (templates.length === 0) return 'No log patterns detected yet. Patterns will appear as logs stream in.';

        const lines = [sectionHeader('Top Log Patterns'), ''];
        for (let i = 0; i < templates.length; i++) {
          const t = templates[i];
          const count = `\x1b[33m${String(t.count).padStart(5)}\x1b[39m`;
          const pattern = t.pattern.replace(/<\*>/g, '\x1b[90m<*>\x1b[39m');
          lines.push(`${count}  ${pattern}`);
        }
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
          return this.client.startContainer(c.id).then(() => { this.onAction(); });
        },
        condition: (item) => panelData<ContainerInfo>(item).state !== 'running',
      },
      {
        key: 'S',
        label: 'Stop',
        handler: (item) => {
          const c = panelData<ContainerInfo>(item);
          return this.client.stopContainer(c.id).then(() => { this.onAction(); });
        },
        condition: (item) => panelData<ContainerInfo>(item).state === 'running',
      },
      {
        key: 'r',
        label: 'Restart',
        handler: (item) => {
          const c = panelData<ContainerInfo>(item);
          return this.client.restartContainer(c.id).then(() => { this.onAction(); });
        },
        condition: (item) => panelData<ContainerInfo>(item).state === 'running',
      },
      {
        key: 'p',
        label: 'Pause',
        handler: (item) => {
          const c = panelData<ContainerInfo>(item);
          return this.client.pauseContainer(c.id).then(() => { this.onAction(); });
        },
        condition: (item) => panelData<ContainerInfo>(item).state === 'running',
      },
      {
        key: 'u',
        label: 'Unpause',
        handler: (item) => {
          const c = panelData<ContainerInfo>(item);
          return this.client.unpauseContainer(c.id).then(() => { this.onAction(); });
        },
        condition: (item) => panelData<ContainerInfo>(item).state === 'paused',
      },
      {
        key: 'd',
        label: 'Remove',
        confirm: true,
        confirmMessage: (item) => `Remove container "${panelData<ContainerInfo>(item).name}"?`,
        confirmSeverity: 'high',
        handler: (item) => {
          const c = panelData<ContainerInfo>(item);
          return this.client.removeContainer(c.id, true).then(() => { this.onAction(); });
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
        key: 'c',
        label: 'Copy Logs',
        handler: () => {
          if (!this.lastMetrics || !this.onCopyLogs) return;
          const logs = this.lastMetrics.selectedContainerLogs;
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
          if (!this.onCopyLogs(lines.join('\n'))) {
            throw new Error('no clipboard tool found (install xclip, xsel, or wl-copy)');
          }
          return `Copied ${lines.length} line${lines.length === 1 ? '' : 's'}`;
        },
      },
    ];
  }

  getSearchableText(item: PanelItem): string {
    const c = panelData<ContainerInfo>(item);
    return `${c.name} ${c.image} ${c.state}`;
  }
}
