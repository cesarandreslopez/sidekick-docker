import { describe, expect, it } from 'vitest';
import type { ContainerInfo } from 'sidekick-docker-shared';
import { buildContainerGroups, composeGroupContextValue, composeGroupTooltip } from './containerGroups';

function makeContainer(overrides: Partial<ContainerInfo> & { id: string }): ContainerInfo {
  return {
    name: overrides.id,
    image: 'nginx:latest',
    state: 'running',
    status: 'Up 2 minutes',
    ports: [],
    created: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('buildContainerGroups', () => {
  it('returns no groups for an empty list', () => {
    expect(buildContainerGroups([])).toEqual([]);
  });

  it('splits containers into Running/Stopped/Other with stable ids and counts', () => {
    const groups = buildContainerGroups([
      makeContainer({ id: 'a', state: 'running' }),
      makeContainer({ id: 'b', state: 'exited' }),
      makeContainer({ id: 'c', state: 'paused' }),
      makeContainer({ id: 'd', state: 'created' }),
    ]);
    expect(groups.map(g => [g.id, g.label, g.count])).toEqual([
      ['group-running', 'Running', 2],
      ['group-stopped', 'Stopped', 1],
      ['group-other', 'Other', 1],
    ]);
  });

  it('groups as the dashboard does: paused and restarting under Running, dead under Stopped', () => {
    const groups = buildContainerGroups([
      makeContainer({ id: 'p', state: 'paused' }),
      makeContainer({ id: 'r', state: 'restarting' }),
      makeContainer({ id: 'x', state: 'dead' }),
      makeContainer({ id: 'c', state: 'created' }),
      makeContainer({ id: 'm', state: 'removing' }),
    ]);
    expect(groups.map(g => [g.label, g.containers.map(c => c.id)])).toEqual([
      ['Running', ['p', 'r']],
      ['Stopped', ['x']],
      ['Other', ['c', 'm']],
    ]);
  });

  it('omits empty state groups', () => {
    const groups = buildContainerGroups([makeContainer({ id: 'a', state: 'exited' })]);
    expect(groups.map(g => g.id)).toEqual(['group-stopped']);
  });

  it('sub-groups compose containers by project inside a state group', () => {
    const groups = buildContainerGroups([
      makeContainer({ id: 'web', composeProject: 'myapp' }),
      makeContainer({ id: 'db', composeProject: 'myapp' }),
      makeContainer({ id: 'solo' }),
    ]);
    expect(groups).toHaveLength(1);
    const running = groups[0];
    expect(running.count).toBe(3);
    expect(running.composeProjects).toHaveLength(1);
    expect(running.composeProjects[0].id).toBe('group-running/proj:myapp');
    expect(running.composeProjects[0].projectName).toBe('myapp');
    expect(running.composeProjects[0].containers.map(c => c.id)).toEqual(['web', 'db']);
    expect(running.containers.map(c => c.id)).toEqual(['solo']);
  });

  it('sorts compose project sub-groups by name', () => {
    const groups = buildContainerGroups([
      makeContainer({ id: 'z1', composeProject: 'zeta' }),
      makeContainer({ id: 'a1', composeProject: 'alpha' }),
    ]);
    expect(groups[0].composeProjects.map(p => p.projectName)).toEqual(['alpha', 'zeta']);
  });

  it('keeps the same project in separate sub-groups per state group', () => {
    const groups = buildContainerGroups([
      makeContainer({ id: 'up', state: 'running', composeProject: 'myapp' }),
      makeContainer({ id: 'down', state: 'exited', composeProject: 'myapp' }),
    ]);
    expect(groups.map(g => g.id)).toEqual(['group-running', 'group-stopped']);
    expect(groups[0].composeProjects[0].id).toBe('group-running/proj:myapp');
    expect(groups[1].composeProjects[0].id).toBe('group-stopped/proj:myapp');
  });

  it('leaves non-compose containers as direct children in input order', () => {
    const groups = buildContainerGroups([
      makeContainer({ id: 'b' }),
      makeContainer({ id: 'a' }),
    ]);
    expect(groups[0].containers.map(c => c.id)).toEqual(['b', 'a']);
    expect(groups[0].composeProjects).toEqual([]);
  });
});

describe('composeGroupContextValue', () => {
  /** Every compose sub-group of one project, across the state groups. */
  function projectGroups(containers: ContainerInfo[]) {
    return buildContainerGroups(containers).flatMap(g => g.composeProjects);
  }

  it('distinguishes a project with running containers from a stopped one', () => {
    const [running] = projectGroups([makeContainer({ id: 'a', composeProject: 'shop' })]);
    const [stopped] = projectGroups([makeContainer({ id: 'c', state: 'exited', composeProject: 'old' })]);
    expect(composeGroupContextValue(running)).toBe('compose-project-group-running');
    expect(composeGroupContextValue(stopped)).toBe('compose-project-group-stopped');
  });

  it('judges a half-up project live in every state group it appears in', () => {
    const groups = projectGroups([
      makeContainer({ id: 'web', state: 'running', composeProject: 'shop' }),
      makeContainer({ id: 'db', state: 'exited', composeProject: 'shop' }),
    ]);
    expect(groups.map(g => [g.id, composeGroupContextValue(g)])).toEqual([
      ['group-running/proj:shop', 'compose-project-group-running'],
      // Down and Restart apply to the whole project, so the Stopped entry offers them too.
      ['group-stopped/proj:shop', 'compose-project-group-running'],
    ]);
  });

  it('counts paused and restarting containers as live, so such a project still offers Down', () => {
    const [paused] = projectGroups([makeContainer({ id: 'a', state: 'paused', composeProject: 'shop' })]);
    const [restarting] = projectGroups([makeContainer({ id: 'b', state: 'restarting', composeProject: 'loop' })]);
    const gone = projectGroups([makeContainer({ id: 'c', state: 'dead', composeProject: 'gone' }), makeContainer({ id: 'd', state: 'created', composeProject: 'gone' })]);
    expect(composeGroupContextValue(paused)).toBe('compose-project-group-running');
    expect(composeGroupContextValue(restarting)).toBe('compose-project-group-running');
    expect(gone.map(composeGroupContextValue)).toEqual(['compose-project-group-stopped', 'compose-project-group-stopped']);
  });
});

describe('composeGroupTooltip', () => {
  const live = { id: 'g/p', projectName: 'shop', containers: [makeContainer({ id: 'a' })], live: true };
  const stopped = { id: 'g/q', projectName: 'old', containers: [makeContainer({ id: 'c', state: 'exited' })], live: false };

  it('names only the actions the menu offers', () => {
    expect(composeGroupTooltip(live, true)).toBe('Compose project shop — right-click for Up, Down, Restart');
    expect(composeGroupTooltip(stopped, true)).toBe('Compose project old — right-click for Up');
  });

  it('says compose is disabled in an untrusted workspace', () => {
    expect(composeGroupTooltip(live, false)).toBe('Compose project shop — compose actions are disabled until this workspace is trusted');
  });
});

