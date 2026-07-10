import type { PanelAction, PanelItem } from '../panels/types';
import type { Action, ToastSeverity } from './dashboardTypes';

export function isPromise(value: unknown): value is Promise<void> {
  return value != null && typeof (value as Promise<void>).then === 'function';
}

/** Execute a panel action with async feedback: in-progress spinner → success/error toast. */
export function executeAction(
  action: PanelAction,
  item: PanelItem,
  dispatch: (action: Action) => void,
  addToast: (message: string, severity: ToastSeverity, duration?: number) => number,
  removeToast: (id: number) => void,
): void {
  const run = () => {
    const result = action.handler(item);
    if (isPromise(result)) {
      const progressId = addToast(`${action.label}…`, 'info');
      result
        .then(() => { removeToast(progressId); addToast(action.label, 'success'); })
        .catch(() => { removeToast(progressId); addToast(`${action.label} failed`, 'error'); });
    } else {
      addToast(action.label, 'info', 2000);
    }
  };

  if (action.confirm) {
    dispatch({ type: 'SET_CONFIRM', action: run, message: action.confirmMessage || 'Are you sure?', severity: action.confirmSeverity ?? 'high' });
  } else {
    run();
  }
}
