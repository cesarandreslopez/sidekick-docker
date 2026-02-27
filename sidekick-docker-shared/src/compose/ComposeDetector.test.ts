import { describe, it, expect } from 'vitest';
import { ComposeDetector } from './ComposeDetector';
import type { ContainerInfo } from '../types/container';

function makeContainer(overrides: Partial<ContainerInfo> = {}): ContainerInfo {
  return {
    id: 'abc123',
    name: 'test',
    image: 'nginx:latest',
    state: 'running',
    status: 'Up 5 minutes',
    ports: [],
    created: new Date(),
    ...overrides,
  };
}

describe('ComposeDetector', () => {
  const detector = new ComposeDetector();

  it('returns empty array when no containers have compose labels', () => {
    const containers = [makeContainer({ id: '1', name: 'standalone' })];
    expect(detector.detect(containers)).toEqual([]);
  });

  it('groups containers by compose project', () => {
    const containers = [
      makeContainer({ id: '1', name: 'web', composeProject: 'myapp', composeService: 'web', image: 'nginx' }),
      makeContainer({ id: '2', name: 'db', composeProject: 'myapp', composeService: 'db', image: 'postgres' }),
    ];

    const projects = detector.detect(containers);
    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe('myapp');
    expect(projects[0].services).toHaveLength(2);
    expect(projects[0].status).toBe('running');
  });

  it('detects partial status when some services are stopped', () => {
    const containers = [
      makeContainer({ id: '1', composeProject: 'app', composeService: 'web', state: 'running' }),
      makeContainer({ id: '2', composeProject: 'app', composeService: 'db', state: 'exited' }),
    ];

    const projects = detector.detect(containers);
    expect(projects[0].status).toBe('partial');
  });

  it('detects stopped status when all services are stopped', () => {
    const containers = [
      makeContainer({ id: '1', composeProject: 'app', composeService: 'web', state: 'exited' }),
      makeContainer({ id: '2', composeProject: 'app', composeService: 'db', state: 'exited' }),
    ];

    const projects = detector.detect(containers);
    expect(projects[0].status).toBe('stopped');
  });

  it('handles multiple compose projects', () => {
    const containers = [
      makeContainer({ id: '1', composeProject: 'app1', composeService: 'web' }),
      makeContainer({ id: '2', composeProject: 'app2', composeService: 'api' }),
    ];

    const projects = detector.detect(containers);
    expect(projects).toHaveLength(2);
    expect(projects.map(p => p.name)).toEqual(['app1', 'app2']);
  });
});
