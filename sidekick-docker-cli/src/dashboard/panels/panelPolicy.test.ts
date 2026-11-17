import { describe, expect, it } from 'vitest';
import type { ComposeClient, DockerClient } from 'sidekick-docker-shared';
import { StatsCollector } from 'sidekick-docker-shared';
import type { DockerDashboardMetrics } from '../DockerState';
import { ContainersPanel, CONTAINER_TAB } from './ContainersPanel';
import { ServicesPanel, SERVICE_TAB } from './ServicesPanel';
import { ImagesPanel } from './ImagesPanel';
import { VolumesPanel } from './VolumesPanel';
import { NetworksPanel } from './NetworksPanel';
import type { PanelItem, SidePanel } from './types';

function metrics(overrides: Partial<DockerDashboardMetrics> = {}): DockerDashboardMetrics {
  return {
    containers: [], images: [], volumes: [], networks: [], composeProjects: [],
    statsCollector: new StatsCollector(),
    containerDetails: new Map(), containerChanges: new Map(), imageLayers: new Map(), detailErrors: new Map(),
    selectedContainerLogs: [], selectedComposeLogs: [], secondaryContainerLogs: [], secondaryComposeLogs: [],
    lastRefresh: new Date(), daemonConnected: true, logFilterString: '', logFilterMode: 'exact',
    logSeverityCounts: null, logSeverityTimeSeries: [], logTemplates: [],
    secondaryLogSeverityCounts: null, secondaryLogSeverityTimeSeries: [],
    logStreamState: null, composeLogStreamState: null,
    secondaryLogStreamState: null, secondaryComposeLogStreamState: null, statsStreamState: null,
    ...overrides,
  };
}

const container = (id: string, state: string) => ({
  id, name: id, image: 'nginx', state, status: '', ports: [], created: new Date(), composeProject: null, composeService: null, labels: {},
});

/** The prune action's skip text after the panel has seen `m`. */
function pruneSkip(panel: SidePanel, m: DockerDashboardMetrics): string | null {
  const items = panel.getItems(m);
  const prune = panel.getActions().find(a => a.key === 'P');
  if (!prune?.nothingToDo) throw new Error(`${panel.title} prune has no nothingToDo`);
  return prune.nothingToDo(items[0] ?? { id: 'x', label: 'x', sortKey: 0, data: {} });
}

describe('prune skips the confirm when there is nothing to prune (B-e)', () => {
  it('containers: only when nothing is stopped', () => {
    const panel = new ContainersPanel({} as DockerClient, () => {});
    expect(pruneSkip(panel, metrics({ containers: [container('a', 'running')] as never }))).toBe('No stopped containers to prune');
    expect(pruneSkip(panel, metrics({ containers: [container('a', 'exited')] as never }))).toBeNull();
  });

  it('images: only when nothing is dangling', () => {
    const panel = new ImagesPanel({} as DockerClient, () => {});
    const image = (isDangling: boolean) => ({ id: 'i', repoTags: isDangling ? [] : ['nginx:1'], size: 1, created: new Date(), isDangling });
    expect(pruneSkip(panel, metrics({ images: [image(false)] as never }))).toBe('No dangling images to prune');
    expect(pruneSkip(panel, metrics({ images: [image(true)] as never }))).toBeNull();
  });

  it('volumes: in-use volumes are not candidates; named volumes are kept on Engine 23+', () => {
    const panel = new VolumesPanel({} as DockerClient, () => {});
    const vol = (isInUse: boolean, anonymous: boolean) => ({
      name: 'v', driver: 'local', mountpoint: '/', created: new Date(), isInUse, usedBy: [], anonymous, pruneScope: 'anonymous',
    });
    expect(pruneSkip(panel, metrics({ volumes: [vol(true, true)] as never }))).toContain('No unused anonymous volumes');
    expect(pruneSkip(panel, metrics({ volumes: [vol(false, false)] as never }))).toContain('named volumes are kept');
    expect(pruneSkip(panel, metrics({ volumes: [vol(false, true)] as never }))).toBeNull();
  });

  it('networks: only built-in networks prove there is nothing to prune', () => {
    const panel = new NetworksPanel({} as DockerClient, () => {});
    const net = (isDefault: boolean, attached: number) => ({
      id: 'n', name: 'n', driver: 'bridge', scope: 'local', isDefault, internal: false, attachable: false,
      ipamDriver: '', ipam: [], containers: Array.from({ length: attached }, () => ({ containerId: 'c', containerName: 'c', ipv4Address: '' })), labels: {},
    });
    expect(pruneSkip(panel, metrics({ networks: [net(true, 0), net(true, 2)] as never }))).toBe('No unused networks to prune');
    // The attached containers may all be stopped, which the daemon still prunes: ask.
    expect(pruneSkip(panel, metrics({ networks: [net(true, 0), net(false, 1)] as never }))).toBeNull();
    expect(pruneSkip(panel, metrics({ networks: [net(false, 0)] as never }))).toBeNull();
  });
});

describe('empty Logs and Stats tabs say why (T14, Missed-3)', () => {
  const item = (data: unknown): PanelItem => ({ id: 'a', label: 'a', sortKey: 0, data });

  it('the Containers Logs tab uses the shared stream wording', () => {
    const panel = new ContainersPanel({} as DockerClient, () => {});
    const render = (m: DockerDashboardMetrics) => panel.detailTabs[CONTAINER_TAB.logs].render(item(container('a', 'exited')), m);
    expect(render(metrics({ logStreamState: 'empty' }))).toEqual(['No log output — the container is stopped.']);
    expect(render(metrics({ logStreamState: 'loading' }))).toEqual(['Waiting for log output…']);
  });

  it('the Services Logs tab names the service', () => {
    const panel = new ServicesPanel({} as ComposeClient, () => {});
    const rendered = panel.detailTabs[SERVICE_TAB.logs].render(item({ type: 'project', project: { name: 'p', services: [] } }), metrics({ composeLogStreamState: 'ended' }));
    expect(rendered).toEqual(['No log output — the service is stopped.']);
  });

  it('the Stats tab stops saying "Loading" once the stream has given up', () => {
    const panel = new ContainersPanel({} as DockerClient, () => {});
    const rendered = panel.detailTabs[CONTAINER_TAB.stats].render(item(container('a', 'running')), metrics({ statsStreamState: 'error' }));
    expect(rendered).toContain('lost after several retries');
  });
});
