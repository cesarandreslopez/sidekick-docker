import * as vscode from 'vscode';

/**
 * Central registry describing every Docker action's user-facing labels and
 * weight. All action surfaces (tree view, quick picks, dashboard webview)
 * route through runDockerAction so feedback stays consistent.
 */
export interface ActionMeta {
  /** Progress notification title while the action runs, e.g. "Stopping web-1…" */
  progressTitle: (name: string) => string;
  /** Success toast/message after the action completes, e.g. "Stopped web-1" */
  successMessage: (name: string) => string;
  /** Slow actions (SIGTERM grace period, `docker compose` spawns) get a withProgress notification. */
  slow: boolean;
}

export const ACTION_META: Record<string, ActionMeta> = {
  start: {
    progressTitle: (name) => `Starting ${name}…`,
    successMessage: (name) => `Started ${name}`,
    slow: false,
  },
  stop: {
    progressTitle: (name) => `Stopping ${name}…`,
    successMessage: (name) => `Stopped ${name}`,
    slow: true,
  },
  restart: {
    progressTitle: (name) => `Restarting ${name}…`,
    successMessage: (name) => `Restarted ${name}`,
    slow: true,
  },
  pause: {
    progressTitle: (name) => `Pausing ${name}…`,
    successMessage: (name) => `Paused ${name}`,
    slow: false,
  },
  unpause: {
    progressTitle: (name) => `Unpausing ${name}…`,
    successMessage: (name) => `Unpaused ${name}`,
    slow: false,
  },
  remove: {
    progressTitle: (name) => `Removing ${name}…`,
    successMessage: (name) => `Removed ${name}`,
    slow: true,
  },
  up: {
    progressTitle: (name) => `Bringing ${name} up…`,
    successMessage: (name) => `${name} is up`,
    slow: true,
  },
  down: {
    progressTitle: (name) => `Taking ${name} down…`,
    successMessage: (name) => `${name} is down`,
    slow: true,
  },
  prune: {
    progressTitle: (name) => `Pruning ${name}…`,
    successMessage: (name) => `Pruned ${name}`,
    slow: true,
  },
};

/**
 * Execute a Docker action. Slow operations run inside a progress
 * notification (visible even if the user switches editor tabs); fast ones
 * run bare. Errors are rethrown so callers surface them on their own UI.
 *
 * The action's resolved value is passed through so callers can report a more
 * specific outcome than the generic success message — prune, for instance,
 * knows how much space it reclaimed.
 */
export async function runDockerAction<T>(meta: ActionMeta, itemName: string, fn: () => Promise<T>): Promise<T> {
  if (!meta.slow) {
    return await fn();
  }
  return await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: meta.progressTitle(itemName),
    },
    () => fn(),
  );
}
