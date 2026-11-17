import { describe, it, expect, vi } from 'vitest';
import { DockerState } from './DockerState';
import type { DockerClient, ContainerDetails } from 'sidekick-docker-shared';

function details(env: string[]): ContainerDetails {
  return { env, restartPolicy: { name: 'no', maximumRetryCount: 0 }, restartCount: 0, mounts: [], exitCode: 0, oomKilled: false, error: '', health: null };
}

const ok = <T>(value: T) => ({ status: 'fulfilled' as const, value });
const fail = (msg: string) => ({ status: 'rejected' as const, reason: new Error(msg) });

function makeClient() {
  return {
    listResources: vi.fn().mockResolvedValue({ containers: ok([]), images: ok([]), volumes: ok([]), networks: ok([]) }),
    dispose: vi.fn(),
  } as unknown as DockerClient & { listResources: ReturnType<typeof vi.fn> };
}

describe('DockerState.invalidateDetails (T18)', () => {
  it('drops one item\'s lazily fetched data and fetch errors, and nothing else', () => {
    const state = new DockerState(makeClient());
    state.setContainerDetails('a', details(['X=1']));
    state.setContainerChanges('a', []);
    state.setImageLayers('a', []);
    state.setDetailError('changes', 'a', 'boom');
    state.setContainerDetails('b', details([]));
    state.invalidateDetails('a');
    expect(state.getContainerDetails('a')).toBeUndefined();
    expect(state.getContainerChanges('a')).toBeUndefined();
    expect(state.getImageLayers('a')).toBeUndefined();
    expect(state.getMetrics().detailErrors.size).toBe(0);
    expect(state.getContainerDetails('b')).toBeDefined();
    state.dispose();
  });
});

describe('DockerState.isDaemonConnected (T6)', () => {
  it('reports whether the last refresh reached the daemon', async () => {
    const client = makeClient();
    const state = new DockerState(client);
    expect(state.isDaemonConnected()).toBe(false);
    await state.refresh();
    expect(state.isDaemonConnected()).toBe(true);
    client.listResources.mockResolvedValue({ containers: fail('down'), images: fail('down'), volumes: fail('down'), networks: fail('down') });
    await state.refresh();
    expect(state.isDaemonConnected()).toBe(false);
    state.dispose();
  });
});
