import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DockerState } from './DockerState';
import type { DockerClient } from 'sidekick-docker-shared';
import type { DockerEvent } from 'sidekick-docker-shared';

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

function makeMockClient(overrides: Partial<DockerClient> = {}): DockerClient {
  return {
    listContainers: vi.fn().mockResolvedValue([makeContainer()]),
    listImages: vi.fn().mockResolvedValue([]),
    listVolumes: vi.fn().mockResolvedValue([]),
    listNetworks: vi.fn().mockResolvedValue([]),
    ping: vi.fn().mockResolvedValue(true),
    dispose: vi.fn(),
    ...overrides,
  } as unknown as DockerClient;
}

describe('DockerState', () => {
  let client: DockerClient;
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
      client = makeMockClient({
        listContainers: vi.fn().mockRejectedValue(new Error('connection refused')),
      });
      state = new DockerState(client);
      await state.refresh();
      expect(state.getMetrics().daemonConnected).toBe(false);
    });
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
      state.processEvent(event);
      const c = state.getMetrics().containers.find(c => c.id === 'abc123');
      expect(c?.state).toBe('running');
      expect(c?.status).toBe('Up just now');
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
      expect(client.listContainers).toHaveBeenCalledTimes(1); // only initial
      // Advance past the 500ms debounce window
      await vi.advanceTimersByTimeAsync(500);
      expect(client.listContainers).toHaveBeenCalledTimes(2); // initial + debounced
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
      expect(client.listContainers).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(500);
      expect(client.listContainers).toHaveBeenCalledTimes(2); // one debounced refresh
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

  describe('inspected env', () => {
    it('stores and retrieves env vars', () => {
      state.setInspectedEnv('abc123', ['FOO=bar', 'BAZ=qux']);
      expect(state.getInspectedEnv('abc123')).toEqual(['FOO=bar', 'BAZ=qux']);
    });

    it('returns undefined for unknown container', () => {
      expect(state.getInspectedEnv('unknown')).toBeUndefined();
    });
  });
});
