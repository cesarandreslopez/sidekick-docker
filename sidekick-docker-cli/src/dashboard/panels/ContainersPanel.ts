import type { ContainerInfo } from 'sidekick-docker-shared';
import { DockerClient } from 'sidekick-docker-shared';
import type { DockerDashboardMetrics } from '../DockerState';
import type { SidePanel, PanelItem, PanelAction, DetailTab } from './types';
import { stateIcon, stateColor, formatPorts, formatBytes, formatMemory, truncate, colorizeLogEntry, colorizeEnvLine, colorizeDetailKey, colorizeState, colorizeId, colorizePercent, compactUptime, sectionHeader, coloredSparkline } from '../../formatters';

export class ContainersPanel implements SidePanel {
  readonly id = 'containers';
  readonly title = 'Containers';
  readonly shortcutKey = 1;

  private client: DockerClient;
  private onAction: () => void;
  private onExec?: (containerId: string) => void;

  constructor(client: DockerClient, onAction: () => void) {
    this.client = client;
    this.onAction = onAction;
  }

  setOnExec(handler: (containerId: string) => void): void {
    this.onExec = handler;
  }

  readonly detailTabs: DetailTab[] = [
    {
      label: 'Logs',
      render: (item, metrics) => {
        const logs = metrics.selectedContainerLogs;
        if (logs.length === 0) return 'No logs available. Select a container to view logs.';
        return logs.map(l => colorizeLogEntry(l)).join('\n');
      },
      autoScrollBottom: true,
    },
    {
      label: 'Stats',
      render: (item, metrics) => {
        const c = item.data as ContainerInfo;
        if (c.state !== 'running') return 'Container is not running.';

        const latest = metrics.statsCollector.getLatest(c.id);
        if (!latest) {
          const frames = '\u280B\u2819\u2839\u2838\u283C\u2834\u2826\u2827';
          const idx = Math.floor(Date.now() / 200) % frames.length;
          return `${frames[idx]} Loading stats...`;
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
          colorizeDetailKey(`PIDs:   ${latest.pids}`),
        );
        return lines.join('\n');
      },
    },
    {
      label: 'Env',
      render: (item, metrics) => {
        const c = item.data as ContainerInfo;
        const env = metrics.inspectedEnv.get(c.id);
        if (!env) return 'Loading environment variables...';
        if (env.length === 0) return 'No environment variables set.';
        return env.sort().map(l => colorizeEnvLine(l)).join('\n');
      },
    },
    {
      label: 'Config',
      render: (item) => {
        const c = item.data as ContainerInfo;
        const lines = [
          sectionHeader('Identity'),
          colorizeDetailKey(`  ID:      ${colorizeId(c.id.substring(0, 12))}`),
          colorizeDetailKey(`  Name:    ${c.name}`),
          colorizeDetailKey(`  Image:   ${c.image}`),
          '',
          sectionHeader('Status'),
          colorizeDetailKey(`  State:   ${colorizeState(c.state)}`),
          colorizeDetailKey(`  Status:  ${c.status}`),
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
  ];

  getItems(metrics: DockerDashboardMetrics): PanelItem[] {
    return metrics.containers.map((c): PanelItem => {
      const uptime = compactUptime(c.status);
      // Show first exposed port as a hint
      const portHint = c.state === 'running' && c.ports.length > 0
        ? `:${c.ports[0].hostPort || c.ports[0].containerPort}`
        : '';
      const namePart = portHint
        ? `${truncate(c.name, 16)} ${portHint}`
        : truncate(c.name, 20);
      return {
        id: c.id,
        label: `${stateIcon(c.state)} ${namePart}`,
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
          const c = item.data as ContainerInfo;
          this.client.startContainer(c.id).then(() => this.onAction()).catch(() => {});
        },
        condition: (item) => (item.data as ContainerInfo).state !== 'running',
      },
      {
        key: 'S',
        label: 'Stop',
        handler: (item) => {
          const c = item.data as ContainerInfo;
          this.client.stopContainer(c.id).then(() => this.onAction()).catch(() => {});
        },
        condition: (item) => (item.data as ContainerInfo).state === 'running',
      },
      {
        key: 'r',
        label: 'Restart',
        handler: (item) => {
          const c = item.data as ContainerInfo;
          this.client.restartContainer(c.id).then(() => this.onAction()).catch(() => {});
        },
        condition: (item) => (item.data as ContainerInfo).state === 'running',
      },
      {
        key: 'd',
        label: 'Remove',
        confirm: true,
        confirmMessage: 'Remove this container?',
        handler: (item) => {
          const c = item.data as ContainerInfo;
          this.client.removeContainer(c.id, true).then(() => this.onAction()).catch(() => {});
        },
      },
      {
        key: 'e',
        label: 'Exec',
        handler: (item) => {
          const c = item.data as ContainerInfo;
          this.onExec?.(c.id);
        },
        condition: (item) => (item.data as ContainerInfo).state === 'running',
      },
    ];
  }

  getSearchableText(item: PanelItem): string {
    const c = item.data as ContainerInfo;
    return `${c.name} ${c.image} ${c.state}`;
  }
}
