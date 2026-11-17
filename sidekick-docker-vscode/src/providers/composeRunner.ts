import * as vscode from 'vscode';

const MANAGE_TRUST = 'Manage Workspace Trust';

/**
 * Compose is refused in an untrusted workspace (it would run the workspace's
 * own compose file). Say so with the way out, instead of only naming it.
 */
export function warnComposeUntrusted(action: string, name: string): void {
  void vscode.window.showWarningMessage(
    `Compose is disabled in an untrusted workspace — trust the folder to ${action} ${name}.`,
    MANAGE_TRUST,
  ).then((choice) => {
    if (choice === MANAGE_TRUST) void vscode.commands.executeCommand('workbench.trust.manage');
  });
}
