import { describe, expect, it } from 'vitest';
import type { ContainerInfo } from 'sidekick-docker-shared';
import { buildContainerGroups } from './containerGroups';

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
      ['group-running', 'Running', 1],
      ['group-stopped', 'Stopped', 1],
      ['group-other', 'Other', 2],
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
