import type { ContainerInfo } from 'sidekick-docker-shared';
import { matchesRunningOnly } from 'sidekick-docker-shared';

/** What the always-on watcher knows about Docker right now. */
export type DockerStatus =
  | { kind: 'connecting' }
  | { kind: 'offline'; reason?: string }
  | { kind: 'connected'; containers: readonly ContainerInfo[] };

export interface StatusBarView {
  text: string;
  /** Warning background: only for a daemon that is really unreachable. */
  warning: boolean;
  /** Markdown. */
  tooltip: string;
  /** Screen-reader label. */
  label: string;
}

/**
 * "Running" the way both dashboards count it: what the running-only toggle
 * keeps (paused and restarting included).
 */
export function runningCount(containers: readonly ContainerInfo[]): number {
  return containers.filter(c => matchesRunningOnly(c.state)).length;
}

/**
 * The status-bar item for a watcher state. Until the first connect settled
 * (and after a settings change rebuilt the watcher) the item used to say
 * "Docker offline" on a warning background while it was only connecting.
 */
export function statusBarView(status: DockerStatus, endpoint: string): StatusBarView {
  switch (status.kind) {
    case 'connecting':
      return {
        text: '$(sync~spin) Docker',
        warning: false,
        tooltip: `**Sidekick Docker** — connecting to ${endpoint}…\n\nClick to open the dashboard.`,
        label: 'Sidekick Docker: connecting to Docker',
      };
    case 'offline':
      return {
        text: '$(warning) Docker offline',
        warning: true,
        tooltip: `**Docker offline** — ${endpoint}\n\n${status.reason ?? 'The daemon is not reachable.'}\n\nClick to open the dashboard.`,
        label: `Sidekick Docker: Docker offline. ${status.reason ?? ''}`.trim(),
      };
    case 'connected': {
      const running = runningCount(status.containers);
      const unhealthy = status.containers.filter(c => c.healthStatus === 'unhealthy').length;
      const total = status.containers.length;
      const summary = `${running} of ${total} containers running${unhealthy ? `, ${unhealthy} unhealthy` : ''}`;
      return {
        text: `$(package) ${running}/${total}${unhealthy ? ` $(warning) ${unhealthy}` : ''}`,
        warning: false,
        tooltip: `**Sidekick Docker** — ${summary}\n\nEndpoint: ${endpoint}\n\nClick to open the dashboard.`,
        label: `Sidekick Docker: ${summary}`,
      };
    }
  }
}
