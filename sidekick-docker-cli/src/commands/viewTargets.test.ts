import { describe, expect, it, vi } from 'vitest';
import { composeTargetOf, createViewScheduler, sameComposeTarget, sortNeedsStats, viewTargets } from './viewTargets';
import type { DashboardViewState } from '../dashboard/ink/Dashboard';
import { ContainersPanel, CONTAINER_TAB } from '../dashboard/panels/ContainersPanel';
import { ServicesPanel, SERVICE_TAB } from '../dashboard/panels/ServicesPanel';
import type { ComposeClient, DockerClient } from 'sidekick-docker-shared';

const view = (overrides: Partial<DashboardViewState> = {}): DashboardViewState => ({
  panelId: 'containers', itemId: 'c1', detailTabIndex: CONTAINER_TAB.logs, sortField: 'state', compareItemId: null, ...overrides,
});

describe('tab positions', () => {
  it('match the panels\' detail tabs', () => {
    const containers = new ContainersPanel({} as DockerClient, () => {});
    expect(containers.detailTabs[CONTAINER_TAB.logs].label).toBe('Logs');
    expect(containers.detailTabs[CONTAINER_TAB.stats].label).toBe('Stats');
    expect(containers.detailTabs[CONTAINER_TAB.env].label).toBe('Env');
    expect(containers.detailTabs[CONTAINER_TAB.config].label).toBe('Config');
    expect(containers.detailTabs[CONTAINER_TAB.files].label).toBe('Files');
    const services = new ServicesPanel({} as ComposeClient, () => {});
    expect(services.detailTabs[SERVICE_TAB.logs].label).toBe('Logs');
  });
});

describe('viewTargets', () => {
  it('streams the selected container\'s logs on every tab, stats only on Stats', () => {
    expect(viewTargets(view())).toMatchObject({ log: 'c1', stats: null, details: 'c1', changes: null });
    expect(viewTargets(view({ detailTabIndex: CONTAINER_TAB.stats }))).toMatchObject({ log: 'c1', stats: 'c1' });
    expect(viewTargets(view({ detailTabIndex: CONTAINER_TAB.patterns }))).toMatchObject({ log: 'c1', stats: null });
  });

  it('fetches the filesystem diff only with the Files tab on screen (T36)', () => {
    expect(viewTargets(view({ detailTabIndex: CONTAINER_TAB.config })).changes).toBeNull();
    expect(viewTargets(view({ detailTabIndex: CONTAINER_TAB.files })).changes).toBe('c1');
  });

  it('streams stats and samples every container when sorting by a stats field', () => {
    const t = viewTargets(view({ sortField: 'cpu' }));
    expect(t.stats).toBe('c1');
    expect(t.sampleAllStats).toBe(true);
    expect(viewTargets(view({ panelId: 'images', sortField: 'cpu' })).sampleAllStats).toBe(false);
    expect(sortNeedsStats('name')).toBe(false);
  });

  it('streams the compare pane only on the Logs tab', () => {
    expect(viewTargets(view({ compareItemId: 'c2' })).secondaryLog).toBe('c2');
    expect(viewTargets(view({ compareItemId: 'c2', detailTabIndex: CONTAINER_TAB.stats })).secondaryLog).toBeNull();
  });

  it('streams compose logs on the Services Logs tab only', () => {
    const logs = viewTargets(view({ panelId: 'services', itemId: 'service:shop:web', detailTabIndex: SERVICE_TAB.logs, compareItemId: 'project:shop' }));
    expect(logs.compose).toEqual({ project: 'shop', service: 'web' });
    expect(logs.secondaryCompose).toEqual({ project: 'shop', service: null });
    expect(logs.log).toBeNull();
    const info = viewTargets(view({ panelId: 'services', itemId: 'service:shop:web', detailTabIndex: SERVICE_TAB.info }));
    expect(info.compose).toEqual({ project: null, service: null });
  });

  it('fetches layers for the selected image and nothing for volumes', () => {
    expect(viewTargets(view({ panelId: 'images', itemId: 'sha256:x' }))).toMatchObject({ layers: 'sha256:x', log: null, details: null });
    expect(viewTargets(view({ panelId: 'volumes', itemId: 'v' }))).toMatchObject({ layers: null, log: null, details: null, changes: null });
  });
});

describe('composeTargetOf', () => {
  it('parses project and service ids, keeping colons in names', () => {
    expect(composeTargetOf('project:a:b')).toEqual({ project: 'a:b', service: null });
    expect(composeTargetOf('service:shop:web:1')).toEqual({ project: 'shop', service: 'web:1' });
    expect(composeTargetOf(null)).toEqual({ project: null, service: null });
    expect(sameComposeTarget(composeTargetOf('project:x'), { project: 'x', service: null })).toBe(true);
  });
});

describe('createViewScheduler (Missed-4)', () => {
  it('applies the first view at once, later ones after the selection settles', () => {
    vi.useFakeTimers();
    try {
      const apply = vi.fn();
      const release = vi.fn();
      const s = createViewScheduler<string>({ apply, release, delayMs: 150 });
      s.change('a');
      expect(apply).toHaveBeenCalledWith('a');
      expect(release).not.toHaveBeenCalled();
      s.change('b');
      s.change('c');
      expect(release).toHaveBeenCalledTimes(2);
      expect(apply).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(149);
      expect(apply).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1);
      expect(apply).toHaveBeenLastCalledWith('c');
      expect(apply).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('flush applies the latest view now and cancels the pending start', () => {
    vi.useFakeTimers();
    try {
      const apply = vi.fn();
      const s = createViewScheduler<string>({ apply });
      s.change('a');
      s.change('b');
      s.flush();
      expect(apply).toHaveBeenLastCalledWith('b');
      vi.runAllTimers();
      expect(apply).toHaveBeenCalledTimes(2);
      s.change('c');
      s.dispose();
      vi.runAllTimers();
      expect(apply).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
