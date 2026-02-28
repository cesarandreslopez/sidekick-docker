import * as vscode from 'vscode';
import { DockerDashboardProvider } from './providers/DockerDashboardProvider';
import { ContainerTreeProvider, ContainerTreeItem } from './providers/ContainerTreeProvider';
import { ContainerWatcherService } from './services/ContainerWatcherService';
import type { ContainerInfo } from 'sidekick-docker-shared';

let dashboardProvider: DockerDashboardProvider | undefined;
let watcherService: ContainerWatcherService | undefined;
let treeProvider: ContainerTreeProvider | undefined;
let treeView: vscode.TreeView<unknown> | undefined;
let statusBarItem: vscode.StatusBarItem | undefined;

export function activate(context: vscode.ExtensionContext): void {
  // ── Dashboard provider ──────────────────────────────────────────
  dashboardProvider = new DockerDashboardProvider(context.extensionUri);
  context.subscriptions.push(dashboardProvider);

  // ── Tree provider ───────────────────────────────────────────────
  treeProvider = new ContainerTreeProvider();

  treeView = vscode.window.createTreeView('sidekick-docker.containers', {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  // ── Status bar ──────────────────────────────────────────────────
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'sidekick-docker.openDashboard';
  statusBarItem.tooltip = 'Sidekick Docker - Click to open dashboard';
  updateStatusBar([], false);
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // ── Container watcher ───────────────────────────────────────────
  watcherService = new ContainerWatcherService({
    onContainersChanged: (containers) => {
      treeProvider!.update(containers, true);
      updateBadge(containers);
      updateStatusBar(containers, true);
    },
    onConnectionChanged: (connected) => {
      if (!connected) {
        treeProvider!.update([], false);
        updateBadge([]);
        updateStatusBar([], false);
      }
    },
  });
  watcherService.start();
  context.subscriptions.push({ dispose: () => watcherService?.dispose() });

  // ── Commands ────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('sidekick-docker.openDashboard', () => {
      dashboardProvider!.open();
    }),

    vscode.commands.registerCommand('sidekick-docker.openContainerInDashboard', (containerId?: string) => {
      if (!containerId) return;
      dashboardProvider!.open(containerId);
    }),

    vscode.commands.registerCommand('sidekick-docker.refreshContainers', () => {
      watcherService?.forceRefresh();
    }),

    vscode.commands.registerCommand('sidekick-docker.startContainer', async (item?: ContainerTreeItem) => {
      if (!(item instanceof ContainerTreeItem)) return;
      try {
        const { DockerClient } = await import('sidekick-docker-shared');
        const client = new DockerClient();
        await client.startContainer(item.container.id);
        client.dispose();
        await watcherService?.forceRefresh();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Failed to start container: ${msg}`);
      }
    }),

    vscode.commands.registerCommand('sidekick-docker.stopContainer', async (item?: ContainerTreeItem) => {
      if (!(item instanceof ContainerTreeItem)) return;
      try {
        const { DockerClient } = await import('sidekick-docker-shared');
        const client = new DockerClient();
        await client.stopContainer(item.container.id);
        client.dispose();
        await watcherService?.forceRefresh();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Failed to stop container: ${msg}`);
      }
    }),

    // ── Quick pick commands ─────────────────────────────────────
    vscode.commands.registerCommand('sidekick-docker.quickStart', async () => {
      const containers = watcherService?.getContainers() ?? [];
      const stopped = containers.filter(c => c.state !== 'running');
      if (stopped.length === 0) {
        vscode.window.showInformationMessage('No stopped containers to start.');
        return;
      }
      const picked = await vscode.window.showQuickPick(
        stopped.map(c => ({ label: c.name, description: c.image, detail: c.status, containerId: c.id })),
        { placeHolder: 'Select a container to start' }
      );
      if (!picked) return;
      try {
        const { DockerClient } = await import('sidekick-docker-shared');
        const client = new DockerClient();
        await client.startContainer(picked.containerId);
        client.dispose();
        await watcherService?.forceRefresh();
        vscode.window.showInformationMessage(`Started ${picked.label}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Failed to start container: ${msg}`);
      }
    }),

    vscode.commands.registerCommand('sidekick-docker.quickStop', async () => {
      const containers = watcherService?.getContainers() ?? [];
      const running = containers.filter(c => c.state === 'running');
      if (running.length === 0) {
        vscode.window.showInformationMessage('No running containers to stop.');
        return;
      }
      const picked = await vscode.window.showQuickPick(
        running.map(c => ({ label: c.name, description: c.image, detail: c.status, containerId: c.id })),
        { placeHolder: 'Select a container to stop' }
      );
      if (!picked) return;
      try {
        const { DockerClient } = await import('sidekick-docker-shared');
        const client = new DockerClient();
        await client.stopContainer(picked.containerId);
        client.dispose();
        await watcherService?.forceRefresh();
        vscode.window.showInformationMessage(`Stopped ${picked.label}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Failed to stop container: ${msg}`);
      }
    }),

    vscode.commands.registerCommand('sidekick-docker.quickRestart', async () => {
      const containers = watcherService?.getContainers() ?? [];
      const running = containers.filter(c => c.state === 'running');
      if (running.length === 0) {
        vscode.window.showInformationMessage('No running containers to restart.');
        return;
      }
      const picked = await vscode.window.showQuickPick(
        running.map(c => ({ label: c.name, description: c.image, detail: c.status, containerId: c.id })),
        { placeHolder: 'Select a container to restart' }
      );
      if (!picked) return;
      try {
        const { DockerClient } = await import('sidekick-docker-shared');
        const client = new DockerClient();
        await client.restartContainer(picked.containerId);
        client.dispose();
        await watcherService?.forceRefresh();
        vscode.window.showInformationMessage(`Restarted ${picked.label}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Failed to restart container: ${msg}`);
      }
    }),
  );
}

function updateBadge(containers: ContainerInfo[]): void {
  if (!treeView) return;
  const running = containers.filter(c => c.state === 'running').length;
  treeView.badge = running > 0 ? { value: running, tooltip: `${running} running container${running !== 1 ? 's' : ''}` } : undefined;
}

function updateStatusBar(containers: ContainerInfo[], connected: boolean): void {
  if (!statusBarItem) return;
  if (!connected) {
    statusBarItem.text = '$(warning) Docker offline';
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    return;
  }
  const running = containers.filter(c => c.state === 'running').length;
  const total = containers.length;
  statusBarItem.text = `$(package) ${running}/${total}`;
  statusBarItem.backgroundColor = undefined;
}

export function deactivate(): void {
  watcherService?.dispose();
  watcherService = undefined;
  dashboardProvider?.dispose();
  dashboardProvider = undefined;
}
