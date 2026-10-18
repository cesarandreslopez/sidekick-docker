import * as vscode from 'vscode';
import { actionText } from 'sidekick-docker-shared';
import type { ActionType } from 'sidekick-docker-shared';

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

/** Slow actions (SIGTERM grace period, `docker compose` spawns) get a withProgress notification. */
const SLOW: Record<ActionType, boolean> = {
  start: false, stop: true, restart: true, pause: false, unpause: false, remove: true, up: true, down: true, prune: true,
};

/** Wording comes from the shared actionText(), so the TUI says exactly the same thing. */
export const ACTION_META: Record<string, ActionMeta> = Object.fromEntries(
  (Object.keys(SLOW) as ActionType[]).map((type): [string, ActionMeta] => [type, {
    progressTitle: (name) => actionText(type, name).progress,
    successMessage: (name) => actionText(type, name).success,
    slow: SLOW[type],
  }]),
);

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
