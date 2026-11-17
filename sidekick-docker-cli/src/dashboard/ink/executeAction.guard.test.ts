import { describe, it, expect, vi } from 'vitest';
import { actionRunKey, executeAction, isActionInFlight } from './executeAction';
import type { PanelAction, PanelItem } from '../panels/types';

function harness() {
  let id = 0;
  return { dispatch: vi.fn(), addToast: vi.fn(() => ++id), removeToast: vi.fn() };
}

const item = (id: string): PanelItem => ({ id, label: id, name: id, sortKey: 0, data: {} });

describe('nothingToDo (T33 / B-e prune)', () => {
  it('shows the text as info and neither confirms nor runs', () => {
    const h = harness();
    const handler = vi.fn();
    const action: PanelAction = {
      key: 'P', label: 'Prune', handler, confirm: true, confirmSeverity: 'batch',
      confirmMessage: 'Remove 0 stopped containers?', nothingToDo: () => 'No stopped containers to prune',
    };
    executeAction(action, item('a'), h.dispatch, h.addToast, h.removeToast);
    expect(h.addToast).toHaveBeenCalledWith('No stopped containers to prune', 'info');
    expect(h.dispatch).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it('opens the confirm as before when there is something to do', () => {
    const h = harness();
    const action: PanelAction = { key: 'P', label: 'Prune', handler: vi.fn(), confirm: true, confirmMessage: 'Remove 2?', nothingToDo: () => null };
    executeAction(action, item('a'), h.dispatch, h.addToast, h.removeToast);
    expect(h.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'SET_CONFIRM', message: 'Remove 2?' }));
  });
});

describe('in-flight guard', () => {
  it('ignores the same action on the same target while it runs, and allows it again after', async () => {
    const h = harness();
    let finish!: () => void;
    const handler = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const action: PanelAction = { key: 'r', label: 'Restart', actionType: 'restart', handler };
    const web = item('web-guard');
    executeAction(action, web, h.dispatch, h.addToast, h.removeToast);
    expect(isActionInFlight(action, web)).toBe(true);
    executeAction(action, web, h.dispatch, h.addToast, h.removeToast);
    expect(handler).toHaveBeenCalledTimes(1);
    // A different target is not blocked.
    executeAction({ ...action, handler: () => Promise.resolve() }, item('db-guard'), h.dispatch, h.addToast, h.removeToast);
    finish();
    await vi.waitFor(() => expect(isActionInFlight(action, web)).toBe(false));
    executeAction(action, web, h.dispatch, h.addToast, h.removeToast);
    expect(handler).toHaveBeenCalledTimes(2);
    finish();
    await vi.waitFor(() => expect(isActionInFlight(action, web)).toBe(false));
  });

  it('clears the guard when the action fails', async () => {
    const h = harness();
    const action: PanelAction = { key: 'S', label: 'Stop', handler: () => Promise.reject(new Error('nope')) };
    const web = item('web-fail');
    executeAction(action, web, h.dispatch, h.addToast, h.removeToast);
    await vi.waitFor(() => expect(isActionInFlight(action, web)).toBe(false));
  });

  it('a confirmed action that is already running does not run twice', async () => {
    const h = harness();
    let finish!: () => void;
    const handler = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const action: PanelAction = { key: 'P', label: 'Prune', handler, confirm: true, targetName: () => 'stopped containers' };
    executeAction(action, item('x1'), h.dispatch, h.addToast, h.removeToast);
    const firstConfirm = h.dispatch.mock.calls[0][0] as { action: () => void };
    firstConfirm.action();
    // Pressed again from another row: same prune, so ignored.
    executeAction(action, item('x2'), h.dispatch, h.addToast, h.removeToast);
    expect(h.dispatch).toHaveBeenCalledTimes(1);
    firstConfirm.action();
    expect(handler).toHaveBeenCalledTimes(1);
    finish();
    await vi.waitFor(() => expect(isActionInFlight(action, item('x1'))).toBe(false));
  });

  it('keys a run by the action and what it acts on', () => {
    const up: PanelAction = { key: 'u', label: 'Up', handler: () => {}, targetName: () => 'shop' };
    expect(actionRunKey(up, item('service:shop:web'))).toBe(actionRunKey(up, item('service:shop:db')));
    const stop: PanelAction = { key: 'S', label: 'Stop', handler: () => {} };
    expect(actionRunKey(stop, item('a'))).not.toBe(actionRunKey(stop, item('b')));
  });
});
