import { describe, it, expect, vi, afterEach } from 'vitest';
import { ContainerWatcherService } from './ContainerWatcherService';
import type { ContainerInfo } from 'sidekick-docker-shared';

const { pingMock, listContainersMock } = vi.hoisted(() => ({
  pingMock: vi.fn(),
  listContainersMock: vi.fn(),
}));

const { watcherRef } = vi.hoisted(() => ({
  watcherRef: { onEvent: null as null | ((e: unknown) => void), onError: null as null | ((e: Error) => void), created: 0, failOnStart: false },
}));

vi.mock('sidekick-docker-shared', async importOriginal => ({
  // The real DockerStateStore runs against the mocked client below.
  ...await importOriginal<typeof import('sidekick-docker-shared')>(),
  DockerClient: class {
    ping = pingMock;
    pingDetailed = async () => {
      try {
        return (await pingMock()) ? { ok: true } : { ok: false, error: Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }) };
      } catch (error) {
        return { ok: false, error };
      }
    };
    listContainers = listContainersMock;
    listResources = async () => {
      try {
        return { containers: { status: 'fulfilled', value: await listContainersMock() } };
      } catch (reason) {
        return { containers: { status: 'rejected', reason } };
      }
    };
    dispose(): void { /* noop */ }
  },
  EventWatcher: class {
    private readonly onError: ((e: Error) => void) | null;
    constructor(_client: unknown, callbacks: { onEvent: (e: unknown) => void; onError?: (e: Error) => void }) {
      watcherRef.onEvent = callbacks.onEvent;
      watcherRef.onError = callbacks.onError ?? null;
      this.onError = callbacks.onError ?? null;
      watcherRef.created++;
    }
    start(): void {
      // An endpoint whose /events always fails (e.g. a proxy denying it).
      // After a round trip, as a real stream fails (not while connect() is still in flight).
      if (watcherRef.failOnStart) setTimeout(() => this.onError?.(new Error('events denied')), 5);
    }
    stop(): void { /* noop */ }
  },
}));

function makeContainer(overrides: Partial<ContainerInfo> = {}): ContainerInfo {
  return {
    id: 'abc123',
    name: 'web',
    image: 'nginx:latest',
    state: 'running',
    status: 'Up 5 minutes',
    ports: [],
    created: new Date(),
    ...overrides,
  };
}

function createCallbacks() {
  return {
    onContainersChanged: vi.fn(),
    onConnectionChanged: vi.fn(),
  };
}

describe('ContainerWatcherService', () => {
  let service: ContainerWatcherService | undefined;

  afterEach(() => {
    service?.dispose();
    service = undefined;
    vi.clearAllMocks();
  });

  it('does not reconnect or publish data when disposed during a pending ping', async () => {
    let resolve!: (value: boolean) => void;
    pingMock.mockReturnValue(new Promise<boolean>(r => { resolve = r; }));
    const callbacks = createCallbacks();
    service = new ContainerWatcherService(callbacks);
    const start = service.start();
    service.dispose();
    resolve(true);
    await start;
    expect(listContainersMock).not.toHaveBeenCalled();
    expect(callbacks.onConnectionChanged).not.toHaveBeenCalled();
  });

  it('ignores a refresh result that arrives after disposal', async () => {
    pingMock.mockResolvedValue(true);
    listContainersMock.mockResolvedValue([]);
    const callbacks = createCallbacks();
    service = new ContainerWatcherService(callbacks);
    await service.start();
    callbacks.onContainersChanged.mockClear();
    let resolve!: (value: ContainerInfo[]) => void;
    listContainersMock.mockReturnValue(new Promise<ContainerInfo[]>(r => { resolve = r; }));
    const pending = service.forceRefresh();
    service.dispose(); resolve([makeContainer()]);
    await pending;
    expect(callbacks.onContainersChanged).not.toHaveBeenCalled();
  });

  it('notifies disconnected when the initial connect fails (ping false)', async () => {
    pingMock.mockResolvedValue(false);
    const callbacks = createCallbacks();
    service = new ContainerWatcherService(callbacks);

    await service.start();

    expect(callbacks.onConnectionChanged).toHaveBeenCalledWith(false, expect.any(String));
    expect(service.isConnected()).toBe(false);
  });

  it('notifies disconnected when the initial connect throws', async () => {
    pingMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const callbacks = createCallbacks();
    service = new ContainerWatcherService(callbacks);

    await service.start();

    expect(callbacks.onConnectionChanged).toHaveBeenCalledWith(false, expect.any(String));
    expect(service.isConnected()).toBe(false);
  });

  it('notifies connected once on a successful initial connect', async () => {
    pingMock.mockResolvedValue(true);
    listContainersMock.mockResolvedValue([makeContainer()]);
    const callbacks = createCallbacks();
    service = new ContainerWatcherService(callbacks);

    await service.start();

    expect(callbacks.onConnectionChanged).toHaveBeenCalledTimes(1);
    expect(callbacks.onConnectionChanged).toHaveBeenCalledWith(true, undefined);
  });

  it('threads the real connection state through onContainersChanged', async () => {
    pingMock.mockResolvedValue(true);
    const container = makeContainer();
    listContainersMock.mockResolvedValue([container]);
    const callbacks = createCallbacks();
    service = new ContainerWatcherService(callbacks);

    await service.start();
    expect(callbacks.onContainersChanged).toHaveBeenLastCalledWith([container], true);

    // Docker goes down mid-session: the containers payload must carry
    // connected=false so consumers cannot re-mark the UI as healthy.
    listContainersMock.mockRejectedValue(new Error('socket hang up'));
    await service.forceRefresh();
    expect(callbacks.onContainersChanged).toHaveBeenLastCalledWith([], false);
    expect(callbacks.onConnectionChanged).toHaveBeenLastCalledWith(false, 'socket hang up');

    // Retrying while Docker is still down must stay disconnected.
    await service.forceRefresh();
    expect(callbacks.onContainersChanged).toHaveBeenLastCalledWith([], false);
    expect(service.isConnected()).toBe(false);
  });

  it('keeps an event that arrives mid-refresh instead of dropping the refresh result', async () => {
    pingMock.mockResolvedValue(true);
    listContainersMock.mockResolvedValue([makeContainer()]);
    const callbacks = createCallbacks();
    service = new ContainerWatcherService(callbacks);
    await service.start();

    let resolve!: (value: ContainerInfo[]) => void;
    listContainersMock.mockReturnValueOnce(new Promise<ContainerInfo[]>(r => { resolve = r; }));
    const pending = service.forceRefresh();
    watcherRef.onEvent?.({ type: 'die', resourceType: 'container', resourceId: 'abc123', timestamp: new Date(), attributes: {} });
    resolve([makeContainer({ name: 'renamed' })]);
    await pending;
    // The pass committed (new name) and the mid-flight die was replayed over it.
    expect(callbacks.onContainersChanged).toHaveBeenLastCalledWith([expect.objectContaining({ name: 'renamed', state: 'exited' })], true);
  });

  it('says why it is disconnected', async () => {
    pingMock.mockResolvedValue(false);
    const callbacks = createCallbacks();
    service = new ContainerWatcherService(callbacks, { endpoint: 'tcp://10.0.0.9:2375' });
    await service.start();
    expect(callbacks.onConnectionChanged).toHaveBeenCalledWith(false, 'Connection refused at tcp://10.0.0.9:2375. Is the Docker daemon running?');
    expect(service.getDisconnectReason()).toMatch(/Connection refused/);
  });

  it('keeps the explained reason when Retry runs while Docker is down', async () => {
    pingMock.mockResolvedValue(false);
    listContainersMock.mockRejectedValue(Object.assign(new Error('connect ECONNREFUSED /var/run/docker.sock'), { code: 'ECONNREFUSED' }));
    const callbacks = createCallbacks();
    service = new ContainerWatcherService(callbacks, { endpoint: 'tcp://10.0.0.9:2375' });
    await service.start();
    await service.forceRefresh();
    for (const [, reason] of callbacks.onConnectionChanged.mock.calls) {
      expect(reason).toBe('Connection refused at tcp://10.0.0.9:2375. Is the Docker daemon running?');
    }
    expect(service.getDisconnectReason()).toMatch(/^Connection refused/);
  });

  it('explains a daemon lost mid-session instead of reporting the raw listing error', async () => {
    pingMock.mockResolvedValue(true);
    listContainersMock.mockResolvedValue([makeContainer()]);
    const callbacks = createCallbacks();
    service = new ContainerWatcherService(callbacks, { endpoint: 'tcp://10.0.0.9:2375' });
    await service.start();

    pingMock.mockResolvedValue(false);
    listContainersMock.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.9:2375'));
    await service.forceRefresh();
    expect(callbacks.onContainersChanged).toHaveBeenLastCalledWith([], false);
    expect(callbacks.onConnectionChanged).toHaveBeenLastCalledWith(false, 'Connection refused at tcp://10.0.0.9:2375. Is the Docker daemon running?');
    expect(callbacks.onConnectionChanged).not.toHaveBeenCalledWith(false, 'connect ECONNREFUSED 10.0.0.9:2375');
    expect(service.isConnected()).toBe(false);
  });

  it('reconnects at once when the event stream drops, without reporting Docker offline while it answers', async () => {
    pingMock.mockResolvedValue(true);
    listContainersMock.mockResolvedValue([makeContainer()]);
    const callbacks = createCallbacks();
    service = new ContainerWatcherService(callbacks);
    await service.start();
    const watchers = watcherRef.created;
    callbacks.onConnectionChanged.mockClear();

    watcherRef.onError?.(new Error('socket hang up'));
    await vi.waitFor(() => expect(watcherRef.created).toBe(watchers + 1));
    expect(callbacks.onConnectionChanged).not.toHaveBeenCalled();
    expect(service.isConnected()).toBe(true);
  });

  it('does not spin when the event stream keeps failing while ping and list succeed', async () => {
    vi.useFakeTimers();
    try {
      pingMock.mockResolvedValue(true);
      listContainersMock.mockResolvedValue([makeContainer()]);
      const callbacks = createCallbacks();
      service = new ContainerWatcherService(callbacks);
      await service.start();
      watcherRef.failOnStart = true;
      pingMock.mockClear();

      watcherRef.onError?.(new Error('events denied'));
      await vi.advanceTimersByTimeAsync(3_000);
      // One immediate reconnect, then the 10 s poll — not thousands of pings.
      expect(pingMock.mock.calls.length).toBeLessThanOrEqual(2);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(pingMock.mock.calls.length).toBeLessThanOrEqual(8);
      expect(service.isConnected()).toBe(true);
    } finally {
      watcherRef.failOnStart = false;
      vi.useRealTimers();
    }
  });

  it('reports offline after a dropped event stream only when the ping fails, with its reason', async () => {
    pingMock.mockResolvedValue(true);
    listContainersMock.mockResolvedValue([makeContainer()]);
    const callbacks = createCallbacks();
    service = new ContainerWatcherService(callbacks, { endpoint: 'tcp://10.0.0.9:2375' });
    await service.start();

    pingMock.mockResolvedValue(false);
    watcherRef.onError?.(new Error('socket hang up'));
    await vi.waitFor(() => expect(service!.isConnected()).toBe(false));
    expect(callbacks.onConnectionChanged).toHaveBeenLastCalledWith(false, 'Connection refused at tcp://10.0.0.9:2375. Is the Docker daemon running?');
  });

  it('changes the fallback refresh interval in place', async () => {
    vi.useFakeTimers();
    try {
      pingMock.mockResolvedValue(true);
      listContainersMock.mockResolvedValue([]);
      const callbacks = createCallbacks();
      service = new ContainerWatcherService(callbacks, { refreshIntervalMs: 30_000 });
      await service.start();
      const watchers = watcherRef.created;
      listContainersMock.mockClear();

      service.setRefreshInterval(5_000);
      await vi.advanceTimersByTimeAsync(5_000);
      expect(listContainersMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(25_000);
      expect(listContainersMock).toHaveBeenCalledTimes(6);
      // No reconnect: same event watcher, no connection notices.
      expect(watcherRef.created).toBe(watchers);
      expect(callbacks.onConnectionChanged).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
