import { describe, it, expect, vi } from 'vitest';
import { executeAction, findPanelAction, unavailableActionText } from './executeAction';
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

describe('findPanelAction', () => {
  const actions = [{ key: 'r', label: 'Restart', handler: () => {} }, { key: 'S', label: 'Stop', handler: () => {} }];

  it('matches the bare key', () => {
    expect(findPanelAction(actions, 'r', {})?.label).toBe('Restart');
    expect(findPanelAction(actions, 'S', {})?.label).toBe('Stop');
  });

  it('never matches a Ctrl or Meta chord', () => {
    expect(findPanelAction(actions, 'r', { ctrl: true })).toBeUndefined();
    expect(findPanelAction(actions, 'r', { meta: true })).toBeUndefined();
  });
});

describe('shared action wording', () => {
  const web: PanelItem = { id: 'c1', label: '● web', name: 'web', sortKey: 0, data: {} };

  it('uses actionText/actionFailedText when the action declares its type', async () => {
    const h = harness();
    const action: PanelAction = { key: 'S', label: 'Stop', actionType: 'stop', handler: () => Promise.reject(new Error('boom')) };
    executeAction(action, web, h.dispatch, h.addToast, h.removeToast);
    expect(h.addToast).toHaveBeenCalledWith('Stopping web…', 'info', undefined, { progress: true });
    await vi.waitFor(() => expect(h.addToast).toHaveBeenCalledWith('Failed to stop web: boom', 'error'));
  });

  it('names the action\'s own target when it is not the item (Up on a service row)', async () => {
    const h = harness();
    const action: PanelAction = { key: 'u', label: 'Up', actionType: 'up', targetName: () => 'shop', handler: () => Promise.resolve() };
    executeAction(action, web, h.dispatch, h.addToast, h.removeToast);
    expect(h.addToast).toHaveBeenCalledWith('Bringing shop up…', 'info', undefined, { progress: true });
    await vi.waitFor(() => expect(h.addToast).toHaveBeenCalledWith('shop is up', 'success'));
  });
});

describe('unavailableActionText (T18)', () => {
  const actions = [{ key: 'S', label: 'Stop', handler: () => {}, condition: () => false }];
  const web: PanelItem = { id: 'c1', label: '○ web', name: 'web', sortKey: 0, data: {} };

  it('explains a panel key that does not apply to this item', () => {
    expect(unavailableActionText(actions, 'S', {}, web)).toBe("Stop isn't available for web");
  });

  it('stays quiet for keys the panel does not have, and for Ctrl chords', () => {
    expect(unavailableActionText(actions, 'Z', {}, web)).toBeNull();
    expect(unavailableActionText(actions, 'S', { ctrl: true }, web)).toBeNull();
  });
});
