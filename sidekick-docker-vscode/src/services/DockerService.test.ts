import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { DockerService } from './DockerService';
import type { DockerServiceCallbacks } from './DockerService';
import type { LogEntry, ContainerInfo } from 'sidekick-docker-shared';

const mocks = vi.hoisted(() => ({ containers: vi.fn(), images: vi.fn(), logs: vi.fn(), stats: vi.fn(), composeLogs: vi.fn(), env: vi.fn(), changes: vi.fn() }));
vi.mock('sidekick-docker-shared', async importOriginal => {
  const actual = await importOriginal<typeof import('sidekick-docker-shared')>();
  return { ...actual,
    DockerClient: class {
      ping = async () => true;
      listContainers = mocks.containers;
      listImages = mocks.images;
      listVolumes = async () => [];
      listNetworks = async () => [];
      streamLogs = mocks.logs;
      streamStats = mocks.stats;
      getContainerEnv = mocks.env;
      getContainerChanges = mocks.changes;
      dispose() {}
    },
    ComposeClient: class { streamLogs = mocks.composeLogs; },
    ComposeFileReader: class { readFromDirectory = async () => null; },
    EventWatcher: class { start() {} stop() {} },
  };
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
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
  mocks.env.mockResolvedValue([]);
  mocks.changes.mockResolvedValue([]);
  mocks.stats.mockImplementation(async function* () {});
  mocks.logs.mockImplementation(async function* () {});
  mocks.composeLogs.mockImplementation(async function* () {});
  callbacks = { onStateChange: vi.fn(), onLogsChange: vi.fn(), onStatsChange: vi.fn(), onComposeLogs: vi.fn(), onEnvLoaded: vi.fn(), onChangesLoaded: vi.fn(), onLayersLoaded: vi.fn(), onError: vi.fn(), onStreamState: vi.fn(), onDetailLoad: vi.fn() };
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
    const refresh = service.forceRefresh();
    void service.forceRefresh(); void service.forceRefresh();
    expect(mocks.containers).toHaveBeenCalledTimes(1);
    first.resolve([container('old')]);
    await refresh;
    expect(mocks.containers).toHaveBeenCalledTimes(2);
    expect(service.getStateSnapshot()).toMatchObject({ containers: [{ id: 'new' }], daemonConnected: true, resourceErrors: { images: 'images denied' } });
    await tick();
    expect(callbacks.onStateChange).toHaveBeenCalled();
  });

  it('surfaces detail failures and permits a successful retry', async () => {
    mocks.env.mockRejectedValueOnce(new Error('env denied')).mockResolvedValueOnce(['OK=yes']);
    await service.loadDetail('env', 'A');
    expect(callbacks.onDetailLoad).toHaveBeenLastCalledWith({ kind: 'env', itemId: 'A', state: 'error', message: 'env denied' });
    await service.loadDetail('env', 'A', true);
    expect(callbacks.onEnvLoaded).toHaveBeenLastCalledWith('A', ['OK=yes']);
    expect(callbacks.onDetailLoad).toHaveBeenLastCalledWith({ kind: 'env', itemId: 'A', state: 'ready' });
  });

  it('does not publish pending refresh or detail completions after disposal', async () => {
    const list = deferred<ContainerInfo[]>();
    const env = deferred<string[]>();
    mocks.containers.mockReturnValue(list.promise); mocks.env.mockReturnValue(env.promise);
    const pending = Promise.all([service.forceRefresh(), service.loadDetail('env', 'A')]);
    service.dispose();
    vi.mocked(callbacks.onDetailLoad!).mockClear();
    list.resolve([container('late')]); env.resolve(['LATE=yes']);
    await pending; await tick();
    expect(callbacks.onStateChange).not.toHaveBeenCalled();
    expect(callbacks.onEnvLoaded).not.toHaveBeenCalled();
    expect(callbacks.onDetailLoad).not.toHaveBeenCalled();
  });
});
