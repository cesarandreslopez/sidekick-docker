import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DockerStateStore } from './DockerStateStore';
import type { StoreChange } from './DockerStateStore';
import type { DockerClient, ListResourcesOptions, ResourceListing } from '../docker/DockerClient';
import type { ComposeConfigSource } from '../compose/ComposeConfigCache';
import type { ContainerInfo } from '../types/container';
import type { DockerEvent } from '../types/events';

const container = (id: string, state: ContainerInfo['state'] = 'running', extra: Partial<ContainerInfo> = {}): ContainerInfo => ({
  id, name: id, image: 'img', state, status: state === 'running' ? 'Up 1 minute' : 'Exited (0)', ports: [], created: new Date(0), ...extra,
});

const ok = <T>(value: T): PromiseFulfilledResult<T> => ({ status: 'fulfilled', value });

function listing(containers: ContainerInfo[]): ResourceListing {
  return { containers: ok(containers), images: ok([]), volumes: ok([]), networks: ok([]) };
}

const ev = (type: string, resourceId = 'a', resourceType: DockerEvent['resourceType'] = 'container'): DockerEvent =>
  ({ type, resourceType, resourceId, timestamp: new Date(0), attributes: {} });

/** A client whose listResources resolves when the test says so. */
function deferredClient() {
  const pending: { resolve: (l: ResourceListing) => void; opts: ListResourcesOptions }[] = [];
  const listResources = vi.fn((opts: ListResourcesOptions) => new Promise<ResourceListing>(resolve => { pending.push({ resolve, opts }); }));
  return {
    client: { listResources } as unknown as DockerClient,
    listResources,
    resolveNext: (l: ResourceListing) => { const p = pending.shift(); if (!p) throw new Error('no pending pass'); p.resolve(l); },
    pending,
  };
}

function immediateClient(get: () => ContainerInfo[]) {
  const listResources = vi.fn(() => Promise.resolve(listing(get())));
  return { client: { listResources } as unknown as DockerClient, listResources };
}

describe('DockerStateStore', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('commits a pass even when events arrive mid-fetch, and replays them over the result', async () => {
    const d = deferredClient();
    const changes: StoreChange[] = [];
    const store = new DockerStateStore({ client: d.client, onChange: c => changes.push(c) });
    const done = store.refresh();
    for (let i = 0; i < 50; i++) store.processEvent(ev('exec_create: /bin/sh -c true'));
    store.processEvent(ev('destroy', 'gone'));
    d.resolveNext(listing([container('a'), container('gone')]));
    await done;
    expect(store.getSnapshot().containers.map(c => c.id)).toEqual(['a']);
    expect(changes.at(-1)).toMatchObject({ cause: 'refresh' });
  });

  it('does no extra work for a sustained healthcheck event storm', async () => {
    const im = immediateClient(() => [container('a', 'running', { healthStatus: 'healthy', status: 'Up (healthy)' })]);
    const store = new DockerStateStore({ client: im.client });
    await store.refresh();
    for (let t = 0; t < 600; t++) {
      store.processEvent(ev('exec_create: /bin/sh -c curl -f localhost'));
      store.processEvent(ev('exec_start: /bin/sh -c curl -f localhost'));
      store.processEvent(ev('exec_die'));
      store.processEvent(ev('health_status: healthy'));
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(im.listResources).toHaveBeenCalledTimes(1);
  });

  it('debounces refresh-worthy events into one pass', async () => {
    const im = immediateClient(() => []);
    const store = new DockerStateStore({ client: im.client });
    store.processEvent(ev('create', 'x'));
    store.processEvent(ev('pull', 'img', 'image'));
    store.processEvent(ev('create', 'y'));
    await vi.advanceTimersByTimeAsync(499);
    expect(im.listResources).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(im.listResources).toHaveBeenCalledTimes(1);
  });

  it('runs exactly one follow-up pass for many refresh() calls during a pass', async () => {
    const d = deferredClient();
    const store = new DockerStateStore({ client: d.client });
    const first = store.refresh();
    const followers = [store.refresh(), store.refresh(), store.refresh()];
    d.resolveNext(listing([container('old')]));
    await first;
    await vi.advanceTimersByTimeAsync(0);
    expect(d.listResources).toHaveBeenCalledTimes(2);
    d.resolveNext(listing([container('new')]));
    await Promise.all(followers);
    expect(store.getSnapshot().containers[0].id).toBe('new');
    expect(d.listResources).toHaveBeenCalledTimes(2);
  });

  it('abandons a hung pass at the deadline, keeps the data, and lets the next pass run', async () => {
    const d = deferredClient();
    const store = new DockerStateStore({ client: d.client, refreshTimeoutMs: 1000 });
    const first = store.refresh();
    d.resolveNext(listing([container('a')]));
    await first;

    const hung = store.refresh();
    await vi.advanceTimersByTimeAsync(1000);
    await hung;
    expect(d.pending[0].opts.signal?.aborted).toBe(true);
    expect(store.getSnapshot().containers.map(c => c.id)).toEqual(['a']);
    expect(store.getSnapshot().resourceErrors.containers).toBe('Timed out after 1s');

    const next = store.refresh();
    d.pending.shift();
    d.resolveNext(listing([container('b')]));
    await next;
    expect(store.getSnapshot().containers.map(c => c.id)).toEqual(['b']);
    expect(store.getSnapshot().resourceErrors).toEqual({});
  });

  it('records per-resource failures and keeps the previous data for them', async () => {
    let fail = false;
    const listResources = vi.fn(() => Promise.resolve(fail
      ? { ...listing([]), images: { status: 'rejected', reason: new Error('boom') } as PromiseRejectedResult }
      : { ...listing([container('a')]), images: ok([{ id: 'i1', repoTags: ['x'], size: 1, created: new Date(0), isDangling: false }]) }));
    const store = new DockerStateStore({ client: { listResources } as unknown as DockerClient });
    await store.refresh();
    fail = true;
    await store.refresh();
    const s = store.getSnapshot();
    expect(s.images.map(i => i.id)).toEqual(['i1']);
    expect(s.resourceErrors).toEqual({ images: 'boom' });
    expect(s.daemonConnected).toBe(true);
  });

  it('reads compose config from cwd, forces it on reloadCompose, and skips it without cwd', async () => {
    const read = vi.fn(() => Promise.resolve({ projectName: 'shop', services: [{ name: 'web', hasBuild: false, ports: [] }] }));
    const composeReader: ComposeConfigSource = { read };
    const im = immediateClient(() => []);
    const store = new DockerStateStore({ client: im.client, cwd: '/app', composeReader });
    await store.refresh();
    await store.refresh({ reloadCompose: true });
    expect(read).toHaveBeenNthCalledWith(1, '/app', expect.objectContaining({ force: false }));
    expect(read).toHaveBeenNthCalledWith(2, '/app', expect.objectContaining({ force: true }));
    expect(store.getSnapshot().composeProjects.map(p => p.name)).toEqual(['shop']);

    const noCwd = new DockerStateStore({ client: im.client, composeReader });
    await noCwd.refresh();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('a containers-only store ignores image events and asks only for containers', async () => {
    const im = immediateClient(() => []);
    const store = new DockerStateStore({ client: im.client, include: { images: false, volumes: false, networks: false, compose: false } });
    store.processEvent(ev('pull', 'img', 'image'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(im.listResources).not.toHaveBeenCalled();
    await store.refresh();
    expect(im.listResources).toHaveBeenCalledWith(expect.objectContaining({ images: false, volumes: false, networks: false }));
  });

  it('patches on events, reports removals, and stays silent for no-ops', async () => {
    const im = immediateClient(() => [container('a'), container('b', 'exited')]);
    const changes: StoreChange[] = [];
    const store = new DockerStateStore({ client: im.client, onChange: c => changes.push(c) });
    await store.refresh();
    changes.length = 0;

    store.processEvent(ev('die', 'a'));
    expect(store.isContainerRunning('a')).toBe(false);
    store.processEvent(ev('die', 'a'));
    store.processEvent(ev('exec_die', 'a'));
    store.processEvent(ev('destroy', 'b'));
    expect(changes).toEqual([
      expect.objectContaining({ cause: 'event', removedContainerIds: [] }),
      expect.objectContaining({ cause: 'event', removedContainerIds: ['b'] }),
    ]);
    expect(store.isContainerRunning('b')).toBeUndefined();
  });

  it('reports removed ids after a refresh', async () => {
    let list = [container('a'), container('b')];
    const im = immediateClient(() => list);
    const changes: StoreChange[] = [];
    const store = new DockerStateStore({ client: im.client, onChange: c => changes.push(c) });
    await store.refresh();
    list = [container('a')];
    await store.refresh();
    expect(changes.at(-1)).toEqual({ cause: 'refresh', removedContainerIds: ['b'], removedImageIds: [] });
  });

  it('knows whether a compose target is running', async () => {
    const im = immediateClient(() => [
      container('w', 'running', { composeProject: 'shop', composeService: 'web' }),
      container('d', 'exited', { composeProject: 'shop', composeService: 'db' }),
    ]);
    const store = new DockerStateStore({ client: im.client });
    await store.refresh();
    expect(store.isComposeTargetRunning('shop', null)).toBe(true);
    expect(store.isComposeTargetRunning('shop', 'db')).toBe(false);
    expect(store.isComposeTargetRunning('other', null)).toBeUndefined();
  });

  it('dispose() mid-pass commits nothing and resolves waiters', async () => {
    const d = deferredClient();
    const store = new DockerStateStore({ client: d.client });
    const first = store.refresh();
    const follower = store.refresh();
    store.dispose();
    await first;
    await follower;
    d.resolveNext(listing([container('late')]));
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getSnapshot().containers).toEqual([]);
  });
});
