import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { DockerService } from './DockerService';
import type { DockerServiceCallbacks } from './DockerService';
import type { LogEntry, ContainerInfo, ContainerDetails } from 'sidekick-docker-shared';

const mocks = vi.hoisted(() => ({
  containers: vi.fn(), images: vi.fn(), logs: vi.fn(), stats: vi.fn(), composeLogs: vi.fn(), env: vi.fn(), changes: vi.fn(),
  watcher: null as null | { onEvent: (e: unknown) => void },
}));
vi.mock('sidekick-docker-shared', async importOriginal => {
  const actual = await importOriginal<typeof import('sidekick-docker-shared')>();
  return { ...actual,
    DockerClient: class {
      ping = async () => true;
      pingDetailed = async () => ({ ok: true });
      listContainers = mocks.containers;
      listImages = mocks.images;
      listVolumes = async () => [];
      listNetworks = async () => [];
      listResources = async () => {
        const [containers, images, volumes, networks] = await Promise.allSettled([mocks.containers(), mocks.images(), Promise.resolve([]), Promise.resolve([])]);
        return { containers, images, volumes, networks };
      };
      streamLogs = mocks.logs;
      streamStats = mocks.stats;
      getContainerDetails = mocks.env;
      getContainerChanges = mocks.changes;
      dispose() {}
    },
    ComposeClient: class { streamLogs = mocks.composeLogs; },
    ComposeFileReader: class { readFromDirectory = async () => null; },
    EventWatcher: class {
      constructor(_client: unknown, callbacks: { onEvent: (e: unknown) => void }) { mocks.watcher = callbacks; }
      start() {}
      stop() {}
    },
  };
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
function details(env: string[]): ContainerDetails {
  return { env, restartPolicy: { name: 'no', maximumRetryCount: 0 }, restartCount: 0, mounts: [], exitCode: 0, oomKilled: false, error: '', health: null };
}
function log(message: string): LogEntry { return { message, stream: 'stdout', timestamp: null }; }
function container(id: string): ContainerInfo { return { id, name: id, state: 'running', status: 'Up', image: 'test', ports: [], created: new Date() }; }
const tick = async () => { await vi.advanceTimersByTimeAsync(110); };
let service: DockerService;
let callbacks: DockerServiceCallbacks;
beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  mocks.containers.mockResolvedValue([]);
  mocks.images.mockResolvedValue([]);
  mocks.env.mockResolvedValue(details([]));
  mocks.changes.mockResolvedValue([]);
  mocks.stats.mockImplementation(async function* () {});
  mocks.logs.mockImplementation(async function* () {});
  mocks.composeLogs.mockImplementation(async function* () {});
  callbacks = { onStateChange: vi.fn(), onLogsChange: vi.fn(), onStatsChange: vi.fn(), onComposeLogs: vi.fn(), onDetailsLoaded: vi.fn(), onChangesLoaded: vi.fn(), onLayersLoaded: vi.fn(), onStreamState: vi.fn(), onDetailLoad: vi.fn() };
  service = new DockerService(callbacks);
});
afterEach(() => { service.dispose(); vi.useRealTimers(); });

describe('DockerService lifecycle', () => {
  it('aborts old A→B→A streams and rejects late data from the first A', async () => {
    const streams: { id: string; signal: AbortSignal; result: ReturnType<typeof deferred<LogEntry>> }[] = [];
    mocks.logs.mockImplementation((id: string, _opts: unknown, signal: AbortSignal) => {
      const result = deferred<LogEntry>(); streams.push({ id, signal, result });
      return (async function* () { yield await result.promise; })();
    });
    await service.initialize();
    for (const id of ['A', 'B', 'A']) service.setViewState({ selectedItemId: id });
    expect(streams).toHaveLength(3);
    expect(streams[0].signal.aborted).toBe(true);
    expect(streams[1].signal.aborted).toBe(true);
    streams[0].result.resolve(log('stale'));
    streams[2].result.resolve(log('current'));
    await tick();
    const calls = vi.mocked(callbacks.onLogsChange).mock.calls;
    expect(calls.flatMap(c => c[1]).some(l => l.message === 'stale')).toBe(false);
    expect(calls.at(-1)?.[1].map(l => l.message)).toEqual(['current']);
    service.dispose();
    expect(streams[2].signal.aborted).toBe(true);
  });

  it('cancels compose logs when only the service changes within a project', async () => {
    const streams: { signal: AbortSignal; result: ReturnType<typeof deferred<LogEntry>> }[] = [];
    mocks.composeLogs.mockImplementation((_project: string, _service: string, _tail: number, signal: AbortSignal) => {
      const result = deferred<LogEntry>(); streams.push({ signal, result });
      return (async function* () { yield await result.promise; })();
    });
    await service.initialize();
    service.setViewState({ activePanelId: 'services', detailTabIndex: 1, composeProjectName: 'app', composeServiceName: 'web' });
    service.setViewState({ composeServiceName: 'api' });
    expect(streams[0].signal.aborted).toBe(true);
    streams[0].result.resolve(log('old web'));
    streams[1].result.resolve(log('new api'));
    await tick();
    expect(vi.mocked(callbacks.onComposeLogs).mock.calls.flatMap(c => c[2]).some(l => l.message === 'old web')).toBe(false);
    expect(callbacks.onComposeLogs).toHaveBeenLastCalledWith('app', 'api', [expect.objectContaining({ message: 'new api' })]);
  });

  it('stops retrying empty streams and allows an explicit retry', async () => {
    await service.initialize();
    service.setViewState({ selectedItemId: 'A' });
    await vi.advanceTimersByTimeAsync(400_000);
    expect(mocks.logs).toHaveBeenCalledTimes(11);
    expect(callbacks.onStreamState).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'logs', state: 'error' }));
    service.retryStreams();
    expect(mocks.logs).toHaveBeenCalledTimes(12);
    await service.setVisible(false);
    await vi.advanceTimersByTimeAsync(400_000);
    expect(mocks.logs).toHaveBeenCalledTimes(12);
  });

  it('coalesces refresh requests, keeps successful resources and reports partial failures', async () => {
    const first = deferred<ContainerInfo[]>();
    mocks.containers.mockReturnValueOnce(first.promise).mockResolvedValue([container('new')]);
    mocks.images.mockRejectedValue(new Error('images denied'));
    const refreshes = [service.forceRefresh(), service.forceRefresh(), service.forceRefresh()];
    expect(mocks.containers).toHaveBeenCalledTimes(1);
    first.resolve([container('old')]);
    await Promise.all(refreshes);
    // One pass in flight plus exactly one shared follow-up pass.
    expect(mocks.containers).toHaveBeenCalledTimes(2);
    expect(service.getStateSnapshot()).toMatchObject({ containers: [{ id: 'new' }], daemonConnected: true, resourceErrors: { images: 'images denied' } });
    await tick();
    expect(callbacks.onStateChange).toHaveBeenCalled();
  });

  it('surfaces detail failures and permits a successful retry', async () => {
    mocks.env.mockRejectedValueOnce(new Error('env denied')).mockResolvedValueOnce(details(['OK=yes']));
    await service.loadDetail('inspect', 'A');
    expect(callbacks.onDetailLoad).toHaveBeenLastCalledWith({ kind: 'inspect', itemId: 'A', state: 'error', message: 'env denied' });
    await service.loadDetail('inspect', 'A', true);
    expect(callbacks.onDetailsLoaded).toHaveBeenLastCalledWith('A', expect.objectContaining({ env: ['OK=yes'] }));
    expect(callbacks.onDetailLoad).toHaveBeenLastCalledWith({ kind: 'inspect', itemId: 'A', state: 'ready' });
  });

  it('does not publish pending refresh or detail completions after disposal', async () => {
    const list = deferred<ContainerInfo[]>();
    const env = deferred<ContainerDetails>();
    mocks.containers.mockReturnValue(list.promise); mocks.env.mockReturnValue(env.promise);
    const pending = Promise.all([service.forceRefresh(), service.loadDetail('inspect', 'A')]);
    service.dispose();
    vi.mocked(callbacks.onDetailLoad!).mockClear();
    list.resolve([container('late')]); env.resolve(details(['LATE=yes']));
    await pending; await tick();
    expect(callbacks.onStateChange).not.toHaveBeenCalled();
    expect(callbacks.onDetailsLoaded).not.toHaveBeenCalled();
    expect(callbacks.onDetailLoad).not.toHaveBeenCalled();
  });

  it('ends a stopped container\'s log stream after its backlog instead of replaying it', async () => {
    mocks.containers.mockResolvedValue([{ ...container('A'), state: 'exited', status: 'Exited (0)' }]);
    mocks.logs.mockImplementation(async function* () { yield log('last words'); });
    await service.initialize();
    service.setViewState({ selectedItemId: 'A' });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mocks.logs).toHaveBeenCalledTimes(1);
    expect(callbacks.onStreamState).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'logs', itemId: 'A', state: 'ended' }));
    expect(vi.mocked(callbacks.onLogsChange).mock.calls.at(-1)?.[1].map(l => l.message)).toEqual(['last words']);
  });

  it('ignores healthcheck exec events and debounces image events', async () => {
    mocks.containers.mockResolvedValue([container('A')]);
    await service.initialize();
    await tick();
    vi.mocked(callbacks.onStateChange).mockClear();
    mocks.containers.mockClear();
    const event = (type: string, resourceType = 'container') => ({ type, resourceType, resourceId: 'A', timestamp: new Date(), attributes: {} });
    for (let i = 0; i < 20; i++) {
      mocks.watcher?.onEvent(event('exec_create: /bin/sh -c true'));
      mocks.watcher?.onEvent(event('exec_die'));
    }
    await vi.advanceTimersByTimeAsync(1000);
    expect(callbacks.onStateChange).not.toHaveBeenCalled();
    expect(mocks.containers).not.toHaveBeenCalled();

    mocks.watcher?.onEvent(event('pull', 'image'));
    mocks.watcher?.onEvent(event('tag', 'image'));
    await vi.advanceTimersByTimeAsync(499);
    expect(mocks.containers).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.containers).toHaveBeenCalledTimes(1);
  });

  it('does not start polling when created behind a hidden panel', async () => {
    mocks.watcher = null;
    service.dispose();
    service = new DockerService(callbacks, { visible: false });
    await service.initialize();
    // setViewState carries `visible`, but must not flip it behind setVisible's back.
    service.setViewState({ visible: true, selectedItemId: 'A' });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mocks.watcher).toBeNull();
    expect(mocks.logs).not.toHaveBeenCalled();
    await service.setVisible(true);
    expect(mocks.watcher).not.toBeNull();
  });

  it('explains why it could not connect', async () => {
    service.dispose();
    service = new DockerService(callbacks, { endpoint: 'unix:///nope.sock' });
    (service as unknown as { client: { pingDetailed(): Promise<unknown> } }).client.pingDetailed = async () => ({
      ok: false, error: Object.assign(new Error('connect EACCES'), { code: 'EACCES' }),
    });
    expect(await service.initialize()).toEqual({ ok: false, reason: expect.stringMatching(/Permission denied on unix:\/\/\/nope\.sock/) });
  });
});
