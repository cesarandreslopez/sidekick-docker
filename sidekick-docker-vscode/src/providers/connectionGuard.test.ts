import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireConnected, withViewProgress, CONTAINERS_VIEW_ID } from './connectionGuard';
import { __mock } from '../test/vscode';

function source(connected: boolean, reason?: string) {
  return { connected, isConnected() { return this.connected; }, getDisconnectReason: () => reason };
}

describe('requireConnected', () => {
  beforeEach(() => __mock.reset());

  it('lets the command run when connected, without a prompt', async () => {
    const retry = vi.fn(async () => { /* noop */ });
    expect(await requireConnected(() => source(true), retry, false)).toBe(true);
    expect(__mock.warningMessages).toEqual([]);
  });

  it('says why Docker is not connected and offers Retry instead of an empty pick list', async () => {
    const retry = vi.fn(async () => { /* noop */ });
    expect(await requireConnected(() => source(false, 'Docker socket not found at /var/run/docker.sock.'), retry, false)).toBe(false);
    expect(__mock.warningMessages).toEqual(['Docker is not connected — Docker socket not found at /var/run/docker.sock.']);
    expect(__mock.messageItems).toEqual([['Retry']]);
    expect(retry).not.toHaveBeenCalled();
  });

  it('continues after a Retry that reconnected, and not after one that did not', async () => {
    __mock.messageChoice = 'Retry';
    const s = source(false, 'refused');
    const retry = vi.fn(async () => { s.connected = true; });
    expect(await requireConnected(() => s, retry, false)).toBe(true);
    expect(retry).toHaveBeenCalledTimes(1);

    const down = source(false, 'refused');
    expect(await requireConnected(() => down, async () => { /* still down */ }, false)).toBe(false);
  });

  it('says it is still connecting during the first connect', async () => {
    await requireConnected(() => source(false), async () => { /* noop */ }, true);
    expect(__mock.warningMessages).toEqual(['Still connecting to Docker…']);
  });
});

describe('withViewProgress', () => {
  beforeEach(() => __mock.reset());

  it('shows progress in the Containers view itself', async () => {
    let ran = false;
    await withViewProgress(async () => { ran = true; });
    expect(ran).toBe(true);
    expect(__mock.progressCalls).toEqual([{ location: { viewId: CONTAINERS_VIEW_ID }, title: undefined, cancellable: false }]);
  });
});
