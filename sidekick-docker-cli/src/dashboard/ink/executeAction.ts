import { errorMessage, actionText, actionFailedText } from 'sidekick-docker-shared';
import type { PanelAction, PanelItem } from '../panels/types';
import { itemName } from '../panels/types';
import type { Action, AddToast } from './dashboardTypes';

/**
 * The panel action a keypress triggers, if any. Modified keys never match:
 * Ink reports Ctrl+R as input 'r' with key.ctrl set, so a bare comparison ran
 * Restart — with no confirmation — for Ctrl+R (and Start/Pause/Exec for
 * Ctrl+S/P/E).
 */
export function findPanelAction(actions: readonly PanelAction[], input: string, key: { ctrl?: boolean; meta?: boolean }): PanelAction | undefined {
  if (key.ctrl || key.meta) return undefined;
  return actions.find(a => a.key === input);
}

/**
 * Toast for a panel key that exists but whose condition rules it out for
 * this item (Stop on a stopped container), or null when the panel has no
 * such key. Such keys used to do nothing at all.
 */
export function unavailableActionText(
  allActions: readonly PanelAction[],
  input: string,
  key: { ctrl?: boolean; meta?: boolean },
  item: PanelItem,
): string | null {
  const action = findPanelAction(allActions, input, key);
  return action ? `${action.label} isn't available for ${itemName(item)}` : null;
}

export function isPromise(value: unknown): value is Promise<unknown> {
  return value != null && typeof (value as Promise<unknown>).then === 'function';
}

/**
 * Progress, success and failure toast text for an action on an item: the
 * shared wording ("Stopping web…", "Failed to stop web: …") when the action
 * declares its type and the target has a name, else the bare label.
 */
export function actionToastText(action: PanelAction, item: PanelItem): {
  progress: string;
  success: string;
  failed: (message: string) => string;
} {
  const name = action.targetName?.(item) ?? item.name;
  const type = action.actionType;
  if (type && name) {
    const text = actionText(type, name);
    return { progress: text.progress, success: text.success, failed: message => actionFailedText(type, name, message) };
  }
  return { progress: `${action.label}…`, success: action.label, failed: message => `${action.label} failed: ${message}` };
}

/**
 * Execute a panel action with feedback:
 * - async handlers get a progress toast (spinner, no auto-expiry) that resolves
 *   into a success toast (the handler's returned string, or the action label)
 *   or an error toast carrying the real Docker error text;
 * - sync handlers get an immediate success toast (returned string or label),
 *   and a synchronous throw becomes an error toast rather than escaping into
 *   Ink's input handler, where it would tear down the app.
 */
export function executeAction(
  action: PanelAction,
  item: PanelItem,
  dispatch: (action: Action) => void,
  addToast: AddToast,
  removeToast: (id: number) => void,
): void {
  const text = actionToastText(action, item);
  const run = () => {
    let result: ReturnType<PanelAction['handler']>;
    try {
      result = action.handler(item);
    } catch (err: unknown) {
      addToast(text.failed(errorMessage(err)), 'error');
      return;
    }
    if (isPromise(result)) {
      const progressId = addToast(text.progress, 'info', undefined, { progress: true });
      result
        .then((msg) => {
          removeToast(progressId);
          addToast(typeof msg === 'string' ? msg : text.success, 'success');
        })
        .catch((err: unknown) => {
          removeToast(progressId);
          addToast(text.failed(errorMessage(err)), 'error');
        });
    } else if (typeof result === 'string') {
      addToast(result, 'success');
    } else {
      addToast(text.success, 'success');
    }
  };

  if (action.confirm) {
    const message = typeof action.confirmMessage === 'function' ? action.confirmMessage(item) : action.confirmMessage;
    dispatch({ type: 'SET_CONFIRM', action: run, message: message || 'Are you sure?', severity: action.confirmSeverity ?? 'high' });
  } else {
    run();
  }
}
