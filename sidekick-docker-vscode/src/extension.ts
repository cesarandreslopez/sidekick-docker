import * as vscode from 'vscode';
import { DockerDashboardProvider } from './providers/DockerDashboardProvider';
import { ContainerTreeProvider, ContainerTreeItem } from './providers/ContainerTreeProvider';
import { ACTION_META, runDockerAction } from './providers/actionRegistry';
import { ContainerWatcherService } from './services/ContainerWatcherService';
import { getSettings, onSettingsChanged } from './settings';
import type { SidekickSettings } from './settings';
import type { ContainerInfo } from 'sidekick-docker-shared';

let dashboardProvider: DockerDashboardProvider | undefined;
let watcherService: ContainerWatcherService | undefined;
let treeProvider: ContainerTreeProvider | undefined;
let treeView: vscode.TreeView<unknown> | undefined;
let statusBarItem: vscode.StatusBarItem | undefined;

async function withDockerClient(
  action: (client: InstanceType<typeof import('sidekick-docker-shared').DockerClient>) => Promise<void>,
  errorPrefix: string,
): Promise<void> {
  let client: InstanceType<typeof import('sidekick-docker-shared').DockerClient> | undefined;
  try {
    const { DockerClient } = await import('sidekick-docker-shared');
    client = new DockerClient(getSettings().clientOptions);
    await action(client);
    await watcherService?.forceRefresh();
  } catch (err: unknown) {
    const { errorMessage } = await import('sidekick-docker-shared');
    vscode.window.showErrorMessage(`${errorPrefix}: ${errorMessage(err)}`);
  } finally {
    client?.dispose();
  }
}

/**
 * Run a container action with unified feedback: slow ops get a progress
 * notification (via the action registry), success gets a native toast,
 * errors surface through the withDockerClient catch.
 */
async function runContainerCommand(
  actionType: 'start' | 'stop' | 'restart' | 'pause' | 'unpause' | 'remove',
  name: string,
  action: (client: InstanceType<typeof import('sidekick-docker-shared').DockerClient>) => Promise<void>,
): Promise<void> {
  const meta = ACTION_META[actionType];
  await withDockerClient(async (client) => {
    await runDockerAction(meta, name, () => action(client));
    vscode.window.showInformationMessage(meta.successMessage(name));
  }, `Failed to ${actionType} container`);
}

function createWatcherService(settings: SidekickSettings): ContainerWatcherService {
  return new ContainerWatcherService({
    onContainersChanged: (containers, connected) => {
      treeProvider!.update(containers, connected);
      updateBadge(containers);
      updateStatusBar(containers, connected);
    },
    onConnectionChanged: (connected) => {
      if (!connected) {
        treeProvider!.update([], false);
        updateBadge([]);
        updateStatusBar([], false);
      }
    },
  }, {
    clientOptions: settings.clientOptions,
    refreshIntervalMs: settings.refreshIntervalMs,
  });
}


/**
 * Prompt for a container when a command was invoked from the palette rather
 * than a tree node.
 */
async function pickContainer(
  filter: (c: ContainerInfo) => boolean,
  placeHolder: string,
): Promise<ContainerInfo | undefined> {
  const candidates = (watcherService?.getContainers() ?? []).filter(filter);
  if (candidates.length === 0) {
    vscode.window.showInformationMessage('No matching containers.');
    return undefined;
  }
  const picked = await vscode.window.showQuickPick(
    candidates.map(c => ({ label: c.name, description: c.image, detail: c.status, container: c })),
    { placeHolder },
  );
  return picked?.container;
}

export function activate(context: vscode.ExtensionContext): void {
  const settings = getSettings();

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
  if (settings.statusBarVisible) statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // ── Container watcher ───────────────────────────────────────────
  watcherService = createWatcherService(settings);
  watcherService.start();
  context.subscriptions.push({ dispose: () => watcherService?.dispose() });

  // ── Settings changes ────────────────────────────────────────────
  context.subscriptions.push(
    onSettingsChanged((next, affected) => {
      if (affected.has('clientOptions') || affected.has('refreshIntervalMs')) {
        watcherService?.dispose();
        watcherService = createWatcherService(next);
        watcherService.start();
        dashboardProvider?.reinitializeService();
      }
      if (affected.has('statusBarVisible')) {
        if (next.statusBarVisible) statusBarItem?.show();
        else statusBarItem?.hide();
      }
    }),
  );

  // ── Dashboard panel serializer (revive after window reload) ─────
  context.subscriptions.push(
    vscode.window.registerWebviewPanelSerializer('sidekick-docker.dashboard', {
      deserializeWebviewPanel: (panel: vscode.WebviewPanel) => {
        dashboardProvider!.restore(panel);
        return Promise.resolve();
      },
    }),
  );

  // ── Commands ────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('sidekick-docker.openDashboard', () => {
      dashboardProvider!.open();
    }),

    vscode.commands.registerCommand('sidekick-docker.openDashboardBeside', () => {
      dashboardProvider!.open(undefined, vscode.ViewColumn.Beside);
    }),

    vscode.commands.registerCommand('sidekick-docker.openContainerInDashboard', (arg?: ContainerTreeItem | string) => {
      const containerId = typeof arg === 'string' ? arg : arg?.container.id;
      if (!containerId) return;
      dashboardProvider!.open(containerId);
    }),

    vscode.commands.registerCommand('sidekick-docker.refreshContainers', () => {
      watcherService?.forceRefresh();
    }),

    vscode.commands.registerCommand('sidekick-docker.startContainer', async (item?: ContainerTreeItem) => {
      if (!(item instanceof ContainerTreeItem)) return;
      await runContainerCommand('start', item.container.name, client => client.startContainer(item.container.id));
    }),

    vscode.commands.registerCommand('sidekick-docker.stopContainer', async (item?: ContainerTreeItem) => {
      if (!(item instanceof ContainerTreeItem)) return;
      await runContainerCommand('stop', item.container.name, client => client.stopContainer(item.container.id));
    }),

    vscode.commands.registerCommand('sidekick-docker.restartContainer', async (item?: ContainerTreeItem) => {
      if (!(item instanceof ContainerTreeItem)) return;
      await runContainerCommand('restart', item.container.name, client => client.restartContainer(item.container.id));
    }),

    vscode.commands.registerCommand('sidekick-docker.pauseContainer', async (item?: ContainerTreeItem) => {
      if (!(item instanceof ContainerTreeItem)) return;
      await runContainerCommand('pause', item.container.name, client => client.pauseContainer(item.container.id));
    }),

    vscode.commands.registerCommand('sidekick-docker.unpauseContainer', async (item?: ContainerTreeItem) => {
      if (!(item instanceof ContainerTreeItem)) return;
      await runContainerCommand('unpause', item.container.name, client => client.unpauseContainer(item.container.id));
    }),

    vscode.commands.registerCommand('sidekick-docker.removeContainer', async (item?: ContainerTreeItem) => {
      if (!(item instanceof ContainerTreeItem)) return;
      const name = item.container.name;
      const choice = await vscode.window.showWarningMessage(
        `Remove container "${name}"?`,
        { modal: true },
        'Remove',
      );
      if (choice !== 'Remove') return;
      await runContainerCommand('remove', name, client => client.removeContainer(item.container.id, true));
    }),

    /*
     * Exec and logs were reachable only from inside the webview dashboard.
     * sidekick-docker.exec.defaultShell was therefore a documented setting for
     * a feature with no command, no palette entry and no tree affordance.
     */
    vscode.commands.registerCommand('sidekick-docker.execContainer', async (item?: ContainerTreeItem) => {
      const container = item instanceof ContainerTreeItem
        ? item.container
        : await pickContainer(c => c.state === 'running', 'Select a running container to exec into');
      if (!container) return;
      const settings = getSettings();
      const terminal = vscode.window.createTerminal({
        name: `Exec: ${container.name}`,
        shellPath: 'docker',
        shellArgs: ['exec', '-it', container.id, settings.execShell],
        // Without this the spawned docker ignores the socketPath setting.
        env: settings.cliEnv,
      });
      terminal.show();
    }),

    vscode.commands.registerCommand('sidekick-docker.showContainerLogs', async (item?: ContainerTreeItem) => {
      const container = item instanceof ContainerTreeItem
        ? item.container
        : await pickContainer(() => true, 'Select a container to view logs');
      if (!container) return;
      const settings = getSettings();
      const terminal = vscode.window.createTerminal({
        name: `Logs: ${container.name}`,
        shellPath: 'docker',
        shellArgs: ['logs', '-f', '--tail', '200', container.id],
        env: settings.cliEnv,
      });
      terminal.show();
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
      await runContainerCommand('start', picked.label, client => client.startContainer(picked.containerId));
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
      await runContainerCommand('stop', picked.label, client => client.stopContainer(picked.containerId));
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
      await runContainerCommand('restart', picked.label, client => client.restartContainer(picked.containerId));
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
