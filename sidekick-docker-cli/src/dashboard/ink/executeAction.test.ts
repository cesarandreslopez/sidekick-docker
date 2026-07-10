import { describe, it, expect, vi } from 'vitest';
import { executeAction } from './executeAction';
import type { PanelAction, PanelItem } from '../panels/types';

const item: PanelItem = { id: 'c1', label: 'web', sortKey: 0, data: {} };

function harness() {
  return {
    dispatch: vi.fn(),
    addToast: vi.fn().mockReturnValue(42),
    removeToast: vi.fn(),
  };
}

describe('executeAction', () => {
  it('shows a progress toast then success for async actions', async () => {
    const h = harness();
    const action: PanelAction = { key: 's', label: 'Start', handler: () => Promise.resolve() };
    executeAction(action, item, h.dispatch, h.addToast, h.removeToast);
    expect(h.addToast).toHaveBeenCalledWith('Start…', 'info', undefined, { progress: true });
    await vi.waitFor(() => expect(h.addToast).toHaveBeenCalledWith('Start', 'success'));
    expect(h.removeToast).toHaveBeenCalledWith(42);
  });

  it('uses a resolved string as the success toast text', async () => {
    const h = harness();
    const action: PanelAction = { key: 'P', label: 'Prune', handler: () => Promise.resolve('Pruned — 1.2 GB reclaimed') };
    executeAction(action, item, h.dispatch, h.addToast, h.removeToast);
    await vi.waitFor(() => expect(h.addToast).toHaveBeenCalledWith('Pruned — 1.2 GB reclaimed', 'success'));
  });

  it('surfaces the real error text when the async action rejects', async () => {
    const h = harness();
    const action: PanelAction = { key: 's', label: 'Remove', handler: () => Promise.reject(new Error('network has active endpoints')) };
    executeAction(action, item, h.dispatch, h.addToast, h.removeToast);
    await vi.waitFor(() => expect(h.addToast).toHaveBeenCalledWith('Remove failed: network has active endpoints', 'error'));
  });

  it('shows an immediate success toast (not a spinner) for sync string results', () => {
    const h = harness();
    const action: PanelAction = { key: 'c', label: 'Copy Logs', handler: () => 'Copied 12 lines' };
    executeAction(action, item, h.dispatch, h.addToast, h.removeToast);
    expect(h.addToast).toHaveBeenCalledWith('Copied 12 lines', 'success');
  });

  it('routes confirm actions through SET_CONFIRM without running the handler', () => {
    const h = harness();
    const handler = vi.fn();
    const action: PanelAction = { key: 'd', label: 'Remove', handler, confirm: true, confirmMessage: 'Remove web?', confirmSeverity: 'high' };
    executeAction(action, item, h.dispatch, h.addToast, h.removeToast);
    expect(handler).not.toHaveBeenCalled();
    expect(h.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'SET_CONFIRM', message: 'Remove web?', severity: 'high' }));
  });
});
