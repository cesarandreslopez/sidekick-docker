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
  it('shows progress then success for async actions', async () => {
    const h = harness();
    const action: PanelAction = { key: 's', label: 'Start', handler: () => Promise.resolve() };
    executeAction(action, item, h.dispatch, h.addToast, h.removeToast);
    expect(h.addToast).toHaveBeenCalledWith('Start…', 'info');
    await vi.waitFor(() => expect(h.addToast).toHaveBeenCalledWith('Start', 'success'));
    expect(h.removeToast).toHaveBeenCalledWith(42);
  });

  it('shows an error toast when the async action rejects', async () => {
    const h = harness();
    const action: PanelAction = { key: 's', label: 'Remove', handler: () => Promise.reject(new Error('in use')) };
    executeAction(action, item, h.dispatch, h.addToast, h.removeToast);
    await vi.waitFor(() => expect(h.addToast).toHaveBeenCalledWith('Remove failed', 'error'));
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
