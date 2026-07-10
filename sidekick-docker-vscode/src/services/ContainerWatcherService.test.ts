import { describe, it, expect, vi, afterEach } from 'vitest';
import { ContainerWatcherService } from './ContainerWatcherService';
import type { ContainerInfo } from 'sidekick-docker-shared';

const { pingMock, listContainersMock } = vi.hoisted(() => ({
  pingMock: vi.fn(),
  listContainersMock: vi.fn(),
}));

vi.mock('sidekick-docker-shared', () => ({
  DockerClient: class {
    ping = pingMock;
    listContainers = listContainersMock;
    dispose(): void { /* noop */ }
  },
  EventWatcher: class {
    start(): void { /* noop */ }
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

  it('notifies disconnected when the initial connect fails (ping false)', async () => {
    pingMock.mockResolvedValue(false);
    const callbacks = createCallbacks();
    service = new ContainerWatcherService(callbacks);

    await service.start();

    expect(callbacks.onConnectionChanged).toHaveBeenCalledWith(false);
    expect(service.isConnected()).toBe(false);
  });

  it('notifies disconnected when the initial connect throws', async () => {
    pingMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const callbacks = createCallbacks();
    service = new ContainerWatcherService(callbacks);

    await service.start();

    expect(callbacks.onConnectionChanged).toHaveBeenCalledWith(false);
    expect(service.isConnected()).toBe(false);
  });

  it('notifies connected once on a successful initial connect', async () => {
    pingMock.mockResolvedValue(true);
    listContainersMock.mockResolvedValue([makeContainer()]);
    const callbacks = createCallbacks();
    service = new ContainerWatcherService(callbacks);

    await service.start();

    expect(callbacks.onConnectionChanged).toHaveBeenCalledTimes(1);
    expect(callbacks.onConnectionChanged).toHaveBeenCalledWith(true);
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
    expect(callbacks.onConnectionChanged).toHaveBeenLastCalledWith(false);

    // Retrying while Docker is still down must stay disconnected.
    await service.forceRefresh();
    expect(callbacks.onContainersChanged).toHaveBeenLastCalledWith([], false);
    expect(service.isConnected()).toBe(false);
  });
});
