import * as vscode from 'vscode';
import { DockerDashboardProvider } from './providers/DockerDashboardProvider';

let dashboardProvider: DockerDashboardProvider | undefined;

export function activate(context: vscode.ExtensionContext): void {
  dashboardProvider = new DockerDashboardProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.commands.registerCommand('sidekick-docker.openDashboard', () => {
      dashboardProvider!.open();
    })
  );

  context.subscriptions.push(dashboardProvider);
}

export function deactivate(): void {
  dashboardProvider?.dispose();
  dashboardProvider = undefined;
}
