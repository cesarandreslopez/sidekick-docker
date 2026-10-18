import { describe, expect, it } from 'vitest';
import { applyEffect, classifyEvent, splitEventAction } from './eventPolicy';
import type { ContainerInfo } from '../types/container';
import type { DockerEvent, DockerResourceType } from '../types/events';

const ev = (resourceType: DockerResourceType, type: string, resourceId = 'c1'): DockerEvent =>
  ({ type, resourceType, resourceId, timestamp: new Date(0), attributes: {} });

const container = (over: Partial<ContainerInfo> = {}): ContainerInfo => ({
  id: 'c1', name: 'web', image: 'nginx', state: 'running', status: 'Up 5 minutes (healthy)',
  ports: [], created: new Date(0), healthStatus: 'healthy', ...over,
});

describe('splitEventAction', () => {
  it('splits a detail after the first colon', () => {
    expect(splitEventAction('health_status: unhealthy')).toEqual({ verb: 'health_status', detail: 'unhealthy' });
    expect(splitEventAction('exec_create: /bin/sh -c curl -f http://x:80')).toEqual({ verb: 'exec_create', detail: '/bin/sh -c curl -f http://x:80' });
    expect(splitEventAction('start')).toEqual({ verb: 'start' });
  });
});

describe('classifyEvent', () => {
  it.each([
    'exec_create: /bin/sh -c curl -f localhost', 'exec_start: /bin/sh -c true', 'exec_die',
    'attach', 'resize', 'kill', 'oom', 'top', 'commit',
  ])('ignores container %s', (type) => {
    expect(classifyEvent(ev('container', type))).toEqual({ kind: 'ignore' });
  });

  it('patches health without a refresh', () => {
    expect(classifyEvent(ev('container', 'health_status: unhealthy'))).toEqual({
      kind: 'patch', containerId: 'c1', patch: { healthStatus: 'unhealthy' }, refresh: [],
    });
    expect(classifyEvent(ev('container', 'health_status: weird'))).toEqual({ kind: 'ignore' });
  });

  it('patches start with a re-sync and stop/die/pause without one', () => {
    expect(classifyEvent(ev('container', 'start'))).toMatchObject({ kind: 'patch', patch: { state: 'running' }, refresh: ['containers', 'volumes', 'networks'] });
    expect(classifyEvent(ev('container', 'die'))).toMatchObject({ kind: 'patch', patch: { state: 'exited' }, refresh: [] });
    expect(classifyEvent(ev('container', 'pause'))).toMatchObject({ kind: 'patch', patch: { state: 'paused' }, refresh: [] });
  });

  it('removes on destroy and refreshes on create/rename/unknown verbs', () => {
    expect(classifyEvent(ev('container', 'destroy'))).toEqual({ kind: 'remove', containerId: 'c1' });
    for (const t of ['create', 'rename', 'update', 'something-new']) {
      expect(classifyEvent(ev('container', t))).toEqual({ kind: 'refresh', resources: ['containers'] });
    }
  });

  it('refreshes the matching list for image/volume/network events, minus the noisy ones', () => {
    expect(classifyEvent(ev('image', 'pull'))).toEqual({ kind: 'refresh', resources: ['images'] });
    expect(classifyEvent(ev('image', 'push'))).toEqual({ kind: 'ignore' });
    expect(classifyEvent(ev('volume', 'create'))).toEqual({ kind: 'refresh', resources: ['volumes'] });
    expect(classifyEvent(ev('volume', 'mount'))).toEqual({ kind: 'ignore' });
    expect(classifyEvent(ev('network', 'connect'))).toEqual({ kind: 'refresh', resources: ['networks'] });
    expect(classifyEvent(ev('daemon', 'reload'))).toEqual({ kind: 'ignore' });
  });
});

describe('applyEffect', () => {
  it('returns a new array with a new object and leaves the input untouched', () => {
    const input = [container()];
    const out = applyEffect(input, { kind: 'patch', containerId: 'c1', patch: { state: 'exited', status: 'Exited' }, refresh: [] });
    expect(out).not.toBe(input);
    expect(out[0]).toMatchObject({ state: 'exited', status: 'Exited' });
    expect(input[0].state).toBe('running');
  });

  it('rewrites the health suffix of the status text', () => {
    const out = applyEffect([container()], { kind: 'patch', containerId: 'c1', patch: { healthStatus: 'unhealthy' }, refresh: [] });
    expect(out[0].status).toBe('Up 5 minutes (unhealthy)');
    const fresh = applyEffect([container({ status: 'Up 2 seconds', healthStatus: undefined })], { kind: 'patch', containerId: 'c1', patch: { healthStatus: 'starting' }, refresh: [] });
    expect(fresh[0].status).toBe('Up 2 seconds (health: starting)');
  });

  it('returns the same array when nothing changes', () => {
    const input = [container()];
    expect(applyEffect(input, { kind: 'patch', containerId: 'nope', patch: { state: 'exited' }, refresh: [] })).toBe(input);
    expect(applyEffect(input, { kind: 'patch', containerId: 'c1', patch: { healthStatus: 'healthy' }, refresh: [] })).toBe(input);
    expect(applyEffect(input, { kind: 'remove', containerId: 'nope' })).toBe(input);
    expect(applyEffect(input, { kind: 'remove', containerId: 'c1' })).toEqual([]);
  });
});
