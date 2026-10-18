import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DockerState } from './DockerState';
import type { DockerClient } from 'sidekick-docker-shared';
import type { DockerEvent, ContainerDetails } from 'sidekick-docker-shared';

function makeContainer(overrides: Record<string, unknown> = {}) {
  return {
    id: 'abc123',
    name: 'test-container',
    image: 'nginx:latest',
    state: 'running',
    status: 'Up 5 minutes',
    ports: [],
    created: new Date('2024-01-01'),
    composeProject: null,
    composeService: null,
    ...overrides,
  };
}

function details(env: string[]): ContainerDetails {
  return { env, restartPolicy: { name: 'no', maximumRetryCount: 0 }, restartCount: 0, mounts: [], exitCode: 0, oomKilled: false, error: '', health: null };
}

const ok = <T>(value: T) => ({ status: 'fulfilled' as const, value });
const fail = (msg: string) => ({ status: 'rejected' as const, reason: new Error(msg) });

function listing(containers: unknown[] = [makeContainer()]) {
  return { containers: ok(containers), images: ok([]), volumes: ok([]), networks: ok([]) };
}

function makeMockClient(overrides: Record<string, unknown> = {}): DockerClient & { listResources: ReturnType<typeof vi.fn> } {
  return {
    listResources: vi.fn().mockImplementation(() => Promise.resolve(listing())),
    ping: vi.fn().mockResolvedValue(true),
    dispose: vi.fn(),
    ...overrides,
  } as unknown as DockerClient & { listResources: ReturnType<typeof vi.fn> };
}

describe('DockerState', () => {
  let client: ReturnType<typeof makeMockClient>;
  let state: DockerState;

  beforeEach(() => {
    vi.useFakeTimers();
    client = makeMockClient();
    state = new DockerState(client);
  });

  afterEach(() => {
    state.dispose();
    vi.useRealTimers();
  });

  describe('refresh', () => {
    it('populates containers on refresh', async () => {
      await state.refresh();
      const metrics = state.getMetrics();
      expect(metrics.containers).toHaveLength(1);
      expect(metrics.containers[0].name).toBe('test-container');
      expect(metrics.daemonConnected).toBe(true);
      expect(metrics.lastRefresh).toBeInstanceOf(Date);
    });

    it('sets daemonConnected false on failure', async () => {
      const refused = fail('connection refused');
      client = makeMockClient({
        listResources: vi.fn().mockResolvedValue({ containers: refused, images: refused, volumes: refused, networks: refused }),
      });
      state = new DockerState(client);
      await state.refresh();
      expect(state.getMetrics().daemonConnected).toBe(false);
    });
  });

  it('commits every pass, and concurrent refreshes share one follow-up pass', async () => {
    let finish!: (l: ReturnType<typeof listing>) => void;
    client.listResources
      .mockReturnValueOnce(new Promise(resolve => { finish = resolve; }))
      .mockResolvedValueOnce(listing([makeContainer({ name: 'new' })]));
    const committed: string[] = [];
    state = new DockerState(client, undefined, () => { committed.push(state.getMetrics().containers[0].name); });
    const refresh = state.refresh();
    const followers = [state.refresh(), state.refresh()];
    finish(listing([makeContainer({ name: 'old' })]));
    await refresh;
    await Promise.all(followers);
    // The first pass committed instead of being discarded, then one follow-up ran.
    expect(committed).toEqual(['old', 'new']);
    expect(client.listResources).toHaveBeenCalledTimes(2);
  });

  it('retains previously loaded resources on partial failure', async () => {
    await state.refresh();
    client.listResources.mockResolvedValueOnce({ ...listing(), containers: fail('containers denied') });
    await state.refresh();
    expect(state.getMetrics()).toMatchObject({ daemonConnected: true, resourceErrors: { containers: 'containers denied' } });
    expect(state.getMetrics().containers).toHaveLength(1);
  });

  it('prunes cached details and their errors for containers that disappear', async () => {
    await state.refresh();
    state.setContainerDetails('abc123', details(['A=1']));
    state.setDetailError('changes', 'abc123', 'boom');
    state.setDetailError('layers', 'img-gone', 'boom');
    client.listResources.mockResolvedValueOnce(listing([]));
    await state.refresh();
    const m = state.getMetrics();
    expect(m.containerDetails.size).toBe(0);
    expect(m.detailErrors.size).toBe(0);
  });

  it('drops details for a destroyed container right away', async () => {
    await state.refresh();
    state.setContainerDetails('abc123', details(['A=1']));
    state.setDetailError('details', 'abc123', 'boom');
    state.processEvent({ type: 'destroy', resourceType: 'container', resourceId: 'abc123', timestamp: new Date(), attributes: {} });
    expect(state.getContainerDetails('abc123')).toBeUndefined();
    expect(state.getMetrics().detailErrors.size).toBe(0);
  });

  it('reads compose config through the injected reader', async () => {
    const read = vi.fn().mockResolvedValue(null);
    state = new DockerState(client, '/proj', undefined, { composeReader: { read } });
    await state.refresh({ reloadCompose: true });
    expect(read).toHaveBeenCalledWith('/proj', expect.objectContaining({ force: true }));
  });

  describe('processEvent', () => {
    beforeEach(async () => {
      await state.refresh();
    });

    it('handles container start event', () => {
      const event: DockerEvent = {
        type: 'start',
        resourceType: 'container',
        resourceId: 'abc123',
        timestamp: new Date(),
        attributes: { name: 'test-container' },
      };
      state.processEvent({ ...event, type: 'die' });
      state.processEvent(event);
      const c = state.getMetrics().containers.find(c => c.id === 'abc123');
      expect(c?.state).toBe('running');
      expect(c?.status).toBe('Up just now');
    });

    it('ignores healthcheck exec events entirely', async () => {
      const changed = vi.fn();
      state = new DockerState(client, undefined, changed);
      await state.refresh();
      changed.mockClear();
      for (const type of ['exec_create: /bin/sh -c true', 'exec_start: /bin/sh -c true', 'exec_die']) {
        state.processEvent({ type, resourceType: 'container', resourceId: 'abc123', timestamp: new Date(), attributes: { name: 'x' } });
      }
      await vi.advanceTimersByTimeAsync(1000);
      expect(changed).not.toHaveBeenCalled();
      expect(client.listResources).toHaveBeenCalledTimes(2);
    });

    it('handles container stop event', () => {
      const event: DockerEvent = {
        type: 'stop',
        resourceType: 'container',
        resourceId: 'abc123',
        timestamp: new Date(),
        attributes: { name: 'test-container' },
      };
      state.processEvent(event);
      const c = state.getMetrics().containers.find(c => c.id === 'abc123');
      expect(c?.state).toBe('exited');
    });

    it('handles container die event', () => {
      const event: DockerEvent = {
        type: 'die',
        resourceType: 'container',
        resourceId: 'abc123',
        timestamp: new Date(),
        attributes: { name: 'test-container' },
      };
      state.processEvent(event);
      const c = state.getMetrics().containers.find(c => c.id === 'abc123');
      expect(c?.state).toBe('exited');
    });

    it('handles container pause event', () => {
      const event: DockerEvent = {
        type: 'pause',
        resourceType: 'container',
        resourceId: 'abc123',
        timestamp: new Date(),
        attributes: { name: 'test-container' },
      };
      state.processEvent(event);
      const c = state.getMetrics().containers.find(c => c.id === 'abc123');
      expect(c?.state).toBe('paused');
    });

    it('handles container destroy event', () => {
      const event: DockerEvent = {
        type: 'destroy',
        resourceType: 'container',
        resourceId: 'abc123',
        timestamp: new Date(),
        attributes: { name: 'test-container' },
      };
      state.processEvent(event);
      expect(state.getMetrics().containers).toHaveLength(0);
    });

    it('triggers debounced refresh for image events', async () => {
      const event: DockerEvent = {
        type: 'pull',
        resourceType: 'image',
        resourceId: 'img123',
        timestamp: new Date(),
        attributes: {},
      };
      state.processEvent(event);
      // Refresh is debounced — not called yet
      expect(client.listResources).toHaveBeenCalledTimes(1); // only initial
      // Advance past the 500ms debounce window
      await vi.advanceTimersByTimeAsync(500);
      expect(client.listResources).toHaveBeenCalledTimes(2); // initial + debounced
    });

    it('coalesces multiple events into one refresh', async () => {
      const makeEvent = (type: string, resourceType: string): DockerEvent => ({
        type,
        resourceType: resourceType as DockerEvent['resourceType'],
        resourceId: 'abc123',
        timestamp: new Date(),
        attributes: { name: 'test' },
      });
      state.processEvent(makeEvent('start', 'container'));
      state.processEvent(makeEvent('pull', 'image'));
      state.processEvent(makeEvent('create', 'container'));
      // All coalesced — only the initial refresh so far
      expect(client.listResources).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(500);
      expect(client.listResources).toHaveBeenCalledTimes(2); // one debounced refresh
    });
  });

  describe('log management', () => {
    it('appends and retrieves logs', () => {
      const entry = { timestamp: new Date(), stream: 'stdout' as const, message: 'hello' };
      state.appendLog(entry);
      expect(state.getMetrics().selectedContainerLogs).toHaveLength(1);
      expect(state.getMetrics().selectedContainerLogs[0].message).toBe('hello');
    });

    it('enforces ring buffer limit on logs', () => {
      for (let i = 0; i < 1100; i++) {
        state.appendLog({ timestamp: new Date(), stream: 'stdout', message: `line ${i}` });
      }
      expect(state.getMetrics().selectedContainerLogs).toHaveLength(1000);
      expect(state.getMetrics().selectedContainerLogs[0].message).toBe('line 100');
    });

    it('clears logs', () => {
      state.appendLog({ timestamp: new Date(), stream: 'stdout', message: 'hello' });
      state.clearLogs();
      expect(state.getMetrics().selectedContainerLogs).toHaveLength(0);
    });
  });

  it('forgets cached details when a health or lifecycle event makes them stale', async () => {
    await state.refresh();
    state.setContainerDetails('abc123', details(['A=1']));
    state.processEvent({ type: 'exec_die', resourceType: 'container', resourceId: 'abc123', timestamp: new Date(), attributes: {} });
    expect(state.getContainerDetails('abc123')).toBeDefined();
    state.processEvent({ type: 'health_status: unhealthy', resourceType: 'container', resourceId: 'abc123', timestamp: new Date(), attributes: {} });
    expect(state.getContainerDetails('abc123')).toBeUndefined();
  });

  describe('container details', () => {
    it('stores and retrieves env vars', () => {
      state.setContainerDetails('abc123', details(['FOO=bar', 'BAZ=qux']));
      expect(state.getContainerDetails('abc123')?.env).toEqual(['FOO=bar', 'BAZ=qux']);
    });

    it('returns undefined for unknown container', () => {
      expect(state.getContainerDetails('unknown')).toBeUndefined();
    });
  });
});
