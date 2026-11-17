import { describe, it, expect, vi } from 'vitest';
import { executeAction } from './executeAction';
import type { PanelAction, PanelItem } from '../panels/types';
import { ContainersPanel } from '../panels/ContainersPanel';
import type { DockerClient } from 'sidekick-docker-shared';

const item: PanelItem = { id: 'n1', label: 'web', name: 'web', sortKey: 0, data: {} };

describe('a null result means no success toast (T31)', () => {
  it('sync', () => {
    const addToast = vi.fn().mockReturnValue(1);
    const action: PanelAction = { key: 'e', label: 'Exec', handler: () => null };
    executeAction(action, item, vi.fn(), addToast, vi.fn());
    expect(addToast).not.toHaveBeenCalled();
  });

  it('async: the spinner goes, nothing replaces it', async () => {
    const addToast = vi.fn().mockReturnValue(7);
    const removeToast = vi.fn();
    const action: PanelAction = { key: 'o', label: 'Open', handler: () => Promise.resolve(null) };
    executeAction(action, { ...item, id: 'n2' }, vi.fn(), addToast, removeToast);
    await vi.waitFor(() => expect(removeToast).toHaveBeenCalledWith(7));
    expect(addToast).toHaveBeenCalledTimes(1);
  });

  it('Exec opens the shell without a "✓ Exec" toast', () => {
    const panel = new ContainersPanel({} as DockerClient, () => {});
    const onExec = vi.fn();
    panel.setOnExec(onExec);
    const exec = panel.getActions().find(a => a.key === 'e')!;
    const container = { id: 'c1', name: 'web', state: 'running' };
    expect(exec.handler({ id: 'c1', label: 'web', sortKey: 0, data: container })).toBeNull();
    expect(onExec).toHaveBeenCalledWith('c1');
  });
});
