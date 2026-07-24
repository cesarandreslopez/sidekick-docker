import { errorMessage } from 'sidekick-docker-shared';
import type { PanelAction, PanelItem } from '../panels/types';
import type { Action, AddToast } from './dashboardTypes';

export function isPromise(value: unknown): value is Promise<unknown> {
  return value != null && typeof (value as Promise<unknown>).then === 'function';
}

/**
 * Execute a panel action with feedback:
 * - async handlers get a progress toast (spinner, no auto-expiry) that resolves
 *   into a success toast (the handler's returned string, or the action label)
 *   or an error toast carrying the real Docker error text;
 * - sync handlers get an immediate success toast (returned string or label).
 */
export function executeAction(
  action: PanelAction,
  item: PanelItem,
  dispatch: (action: Action) => void,
  addToast: AddToast,
  removeToast: (id: number) => void,
): void {
  const run = () => {
    const result = action.handler(item);
    if (isPromise(result)) {
      const progressId = addToast(`${action.label}…`, 'info', undefined, { progress: true });
      result
        .then((msg) => {
          removeToast(progressId);
          addToast(typeof msg === 'string' ? msg : action.label, 'success');
        })
        .catch((err: unknown) => {
          removeToast(progressId);
          addToast(`${action.label} failed: ${errorMessage(err)}`, 'error');
        });
    } else if (typeof result === 'string') {
      addToast(result, 'success');
    } else {
      addToast(action.label, 'success');
    }
  };

  if (action.confirm) {
    const message = typeof action.confirmMessage === 'function' ? action.confirmMessage(item) : action.confirmMessage;
    dispatch({ type: 'SET_CONFIRM', action: run, message: message || 'Are you sure?', severity: action.confirmSeverity ?? 'high' });
  } else {
    run();
  }
}
