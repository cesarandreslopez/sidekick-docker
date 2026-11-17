import * as vscode from 'vscode';

export const CONTAINERS_VIEW_ID = 'sidekick-docker.containers';

export interface ConnectionSource {
  isConnected(): boolean;
  getDisconnectReason(): string | undefined;
}

/**
 * Run a reconnect under the Containers view's own progress bar — the Retry
 * link and refresh button live there, and used to give no sign of working.
 */
export function withViewProgress(run: () => Promise<void>): Thenable<void> {
  return vscode.window.withProgress({ location: { viewId: CONTAINERS_VIEW_ID } }, run);
}

/**
 * Gate a palette command on a live connection. While Docker was down the
 * quick picks said "No stopped containers to start" — true of an empty list,
 * not of Docker. Says why instead and offers Retry; resolves true only when
 * connected (including after a Retry that worked).
 *
 * @param source read on each check: a settings change can replace the watcher.
 * @param connecting the first connect (or a rebuild) has not settled yet.
 */
export async function requireConnected(
  source: () => ConnectionSource | undefined,
  retry: () => Thenable<void>,
  connecting: boolean,
): Promise<boolean> {
  if (source()?.isConnected()) return true;
  const text = connecting
    ? 'Still connecting to Docker…'
    : `Docker is not connected — ${source()?.getDisconnectReason() ?? 'the daemon is not reachable.'}`;
  const choice = await vscode.window.showWarningMessage(text, 'Retry');
  if (choice !== 'Retry') return false;
  await retry();
  return source()?.isConnected() === true;
}
