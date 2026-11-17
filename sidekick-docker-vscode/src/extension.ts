import * as vscode from 'vscode';
import { DockerDashboardProvider } from './providers/DockerDashboardProvider';
import { ContainerTreeProvider, ContainerTreeItem, containerIdFromArg, openOptionsFromArg } from './providers/ContainerTreeProvider';
import { ACTION_META, runDockerAction } from './providers/actionRegistry';
import { ContainerWatcherService } from './services/ContainerWatcherService';
import { statusBarView, runningCount } from './providers/statusBar';
import type { DockerStatus } from './providers/statusBar';
import { requireConnected, withViewProgress } from './providers/connectionGuard';
import { warnComposeUntrusted } from './providers/composeRunner';
import { getSettings, onSettingsChanged, warnIfInvalidEndpoint } from './settings';
import type { SidekickSettings } from './settings';
import type { ContainerInfo } from 'sidekick-docker-shared';
import { actionFailedText, canStart, canStop, composeDownConfirmMessage, describeDockerEndpoint, removeContainerConfirmMessage } from 'sidekick-docker-shared';
import type { ComposeProjectGroupItem } from './providers/ContainerTreeProvider';

let dashboardProvider: DockerDashboardProvider | undefined;
let watcherService: ContainerWatcherService | undefined;
let treeProvider: ContainerTreeProvider | undefined;
let treeView: vscode.TreeView<unknown> | undefined;
let statusBarItem: vscode.StatusBarItem | undefined;
/** Why Docker is unreachable, kept so a later container update keeps saying it. */
let offlineReason: string | undefined;
/** Whether the tree's "Connecting…" welcome is still showing. */
let connecting = true;

/**
 * End the "Connecting…" state. Only once containers arrive (or the connect
 * fails): clearing it on the connection notice alone flashed "No containers
 * found" before the first listing.
 */
function connectingDone(): void {
  if (!connecting) return;
  connecting = false;
  void vscode.commands.executeCommand('setContext', 'sidekickDocker.connecting', false);
}

/**
 * (Re)create the always-on watcher. A rebuild (endpoint setting, workspace
 * trust) first puts every surface back to "Connecting…": the tree used to
 * keep the old daemon's containers, and the status bar its old count, until
 * the new connection answered.
 */
function rebuildWatcher(settings: SidekickSettings): void {
  watcherService?.dispose();
  offlineReason = undefined;
  connecting = true;
  void vscode.commands.executeCommand('setContext', 'sidekickDocker.connecting', true);
  if (treeView) treeView.message = undefined;
  // Not "daemon down": the Connecting… welcome shows while the context is set.
  treeProvider?.update([], true);
  updateBadge([]);
  updateStatusBar({ kind: 'connecting' });
  watcherService = createWatcherService(settings);
  void watcherService.start();
}

/** Reconnect the watcher, with progress in the Containers view. */
function retryConnection(): Thenable<void> {
  return withViewProgress(async () => { await watcherService?.forceRefresh(); });
}

/** Palette commands act on the watcher's list: refuse (with the reason and Retry) while disconnected. */
function ensureConnected(): Promise<boolean> {
  return requireConnected(() => watcherService, retryConnection, connecting);
}

async function withDockerClient(
  action: (client: InstanceType<typeof import('sidekick-docker-shared').DockerClient>) => Promise<void>,
  failureText: (message: string) => string,
): Promise<void> {
  let client: InstanceType<typeof import('sidekick-docker-shared').DockerClient> | undefined;
  try {
    const { DockerClient } = await import('sidekick-docker-shared');
    client = new DockerClient(getSettings().clientOptions);
    await action(client);
  } catch (err: unknown) {
    const { errorMessage } = await import('sidekick-docker-shared');
    vscode.window.showErrorMessage(failureText(errorMessage(err)));
  } finally {
    client?.dispose();
  }
  // Outside the try: a refresh problem is not the action's failure.
  await watcherService?.forceRefresh().catch((e: unknown) => console.debug('refresh after action failed:', e));
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
  }, message => actionFailedText(actionType, name, message));
}

function createWatcherService(settings: SidekickSettings): ContainerWatcherService {
  return new ContainerWatcherService({
    onContainersChanged: (containers, connected) => {
      treeProvider!.update(containers, connected);
      connectingDone();
      updateBadge(containers);
      updateStatusBar(connected ? { kind: 'connected', containers } : { kind: 'offline', reason: offlineReason });
    },
    onConnectionChanged: (connected, reason) => {
      offlineReason = connected ? undefined : reason;
      // A failed connect never lists containers, so it ends "Connecting…" here.
      if (!connected) connectingDone();
      // viewsWelcome text is static; the tree's message can say *why*.
      if (treeView) treeView.message = connected ? undefined : reason;
      if (!connected) {
        treeProvider!.update([], false);
        updateBadge([]);
        updateStatusBar({ kind: 'offline', reason });
      } else {
        // Docker is back: a dashboard whose own connect failed follows.
        dashboardProvider?.retryIfDisconnected();
      }
    },
  }, {
    clientOptions: settings.clientOptions,
    refreshIntervalMs: settings.refreshIntervalMs,
    endpoint: settings.socketPath,
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
  if (!await ensureConnected()) return undefined;
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
  warnIfInvalidEndpoint();

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
  statusBarItem = vscode.window.createStatusBarItem('sidekick-docker.status', vscode.StatusBarAlignment.Right, 100);
  statusBarItem.name = 'Sidekick Docker';
  statusBarItem.command = 'sidekick-docker.openDashboard';
  updateStatusBar({ kind: 'connecting' });
  if (settings.statusBarVisible) statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // ── Container watcher ───────────────────────────────────────────
  // Until the first connect settles, show "Connecting…" rather than "No containers found".
  rebuildWatcher(settings);
  context.subscriptions.push({ dispose: () => watcherService?.dispose() });

  // ── Settings changes ────────────────────────────────────────────
  context.subscriptions.push(
    onSettingsChanged((next, affected) => {
      if (affected.has('clientOptions')) {
        warnIfInvalidEndpoint();
        // A new endpoint is a new connection (it also picks up the interval).
        rebuildWatcher(next);
        dashboardProvider?.reinitializeService();
      } else if (affected.has('refreshIntervalMs')) {
        // In place: rebuilding dropped the dashboard's logs and sparklines.
        watcherService?.setRefreshInterval(next.refreshIntervalMs);
        dashboardProvider?.setRefreshInterval(next.refreshIntervalMs);
      }
      if (affected.has('statusBarVisible')) {
        if (next.statusBarVisible) statusBarItem?.show();
        else statusBarItem?.hide();
      }
    }),
  );

  // ── Workspace trust ─────────────────────────────────────────────
  // socketPath and exec.defaultShell are restricted configurations: until the
  // folder is trusted VS Code ignores the workspace's values for them, so a
  // cloned repo's .vscode/settings.json cannot point the always-on watcher (or
  // exec terminals) at a daemon of its choosing. Granting trust can change the
  // effective endpoint and enables compose, so rebuild both surfaces.
  context.subscriptions.push(
    vscode.workspace.onDidGrantWorkspaceTrust(() => {
      warnIfInvalidEndpoint();
      rebuildWatcher(getSettings());
      dashboardProvider?.reinitializeService();
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

    vscode.commands.registerCommand('sidekick-docker.openContainerInDashboard', (arg?: unknown, options?: unknown) => {
      const containerId = containerIdFromArg(arg);
      if (!containerId) return;
      dashboardProvider!.open(containerId, undefined, openOptionsFromArg(options).preserveFocus);
    }),

    // F5 while the dashboard is the active editor (package.json keybinding).
    // Keeps F5 from also starting the debugger there.
    vscode.commands.registerCommand('sidekick-docker.refreshDashboard', () => dashboardProvider?.refreshFromKeybinding()),

    // Also the welcome view's "Retry Connection" link.
    vscode.commands.registerCommand('sidekick-docker.refreshContainers', () => retryConnection()),

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
        removeContainerConfirmMessage(item.container),
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
      if (!await ensureConnected()) return;
      const containers = watcherService?.getContainers() ?? [];
      // Not paused ones: Docker rejects start for those.
      const stopped = containers.filter(c => canStart(c.state));
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

    // ── Compose project groups (tree context menu) ──────────────
    vscode.commands.registerCommand('sidekick-docker.composeUp', (item?: ComposeProjectGroupItem) => runComposeCommand('up', item)),
    vscode.commands.registerCommand('sidekick-docker.composeRestart', (item?: ComposeProjectGroupItem) => runComposeCommand('restart', item)),
    vscode.commands.registerCommand('sidekick-docker.composeDown', async (item?: ComposeProjectGroupItem) => {
      if (!item?.project) return;
      const choice = await vscode.window.showWarningMessage(
        composeDownConfirmMessage(item.project.projectName),
        { modal: true },
        'Down',
      );
      if (choice === 'Down') await runComposeCommand('down', item);
    }),

    vscode.commands.registerCommand('sidekick-docker.quickStop', async () => {
      if (!await ensureConnected()) return;
      const containers = watcherService?.getContainers() ?? [];
      // Paused and restarting containers can be stopped too (shared gating).
      const stoppable = containers.filter(c => canStop(c.state));
      if (stoppable.length === 0) {
        vscode.window.showInformationMessage('No running, paused or restarting containers to stop.');
        return;
      }
      const picked = await vscode.window.showQuickPick(
        stoppable.map(c => ({ label: c.name, description: c.image, detail: c.status, containerId: c.id })),
        { placeHolder: 'Select a container to stop' }
      );
      if (!picked) return;
      await runContainerCommand('stop', picked.label, client => client.stopContainer(picked.containerId));
    }),

    vscode.commands.registerCommand('sidekick-docker.quickRestart', async () => {
      if (!await ensureConnected()) return;
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
  const running = runningCount(containers);
  treeView.badge = running > 0 ? { value: running, tooltip: `${running} running container${running !== 1 ? 's' : ''}` } : undefined;
}

function updateStatusBar(status: DockerStatus): void {
  if (!statusBarItem) return;
  const view = statusBarView(status, describeDockerEndpoint(getSettings().socketPath));
  statusBarItem.text = view.text;
  statusBarItem.backgroundColor = view.warning ? new vscode.ThemeColor('statusBarItem.warningBackground') : undefined;
  statusBarItem.tooltip = new vscode.MarkdownString(view.tooltip);
  statusBarItem.accessibilityInformation = { label: view.label, role: 'button' };
}

/**
 * Run `docker compose up|down|restart` for a tree compose group. The project's
 * location comes from the labels Docker recorded on its containers, falling
 * back to the first workspace folder. Refused in an untrusted workspace: it
 * would execute the workspace's compose file (the menu is hidden there too).
 */
async function runComposeCommand(action: 'up' | 'down' | 'restart', item?: ComposeProjectGroupItem): Promise<void> {
  if (!item?.project) return;
  const name = item.project.projectName;
  if (!vscode.workspace.isTrusted) {
    warnComposeUntrusted(action, name);
    return;
  }
  const shared = await import('sidekick-docker-shared');
  try {
    const settings = getSettings();
    const source = shared.ComposeDetector.projectSourceFromLabels(item.project.containers[0]?.labels);
    const options = shared.resolveComposeOptions(source, vscode.workspace.workspaceFolders?.[0]?.uri.fsPath);
    const compose = new shared.ComposeClient(settings.cliEnv);
    const meta = ACTION_META[action];
    await runDockerAction(meta, name, async () => {
      const run = action === 'up' ? compose.up(name, options)
        : action === 'down' ? compose.down(name, options)
        : compose.restart(name, undefined, options);
      shared.throwIfComposeFailed(await run, action);
    });
    vscode.window.showInformationMessage(meta.successMessage(name));
  } catch (err: unknown) {
    vscode.window.showErrorMessage(actionFailedText(action, name, shared.errorMessage(err)));
  } finally {
    await watcherService?.forceRefresh();
  }
}

export function deactivate(): void {
  watcherService?.dispose();
  watcherService = undefined;
  dashboardProvider?.dispose();
  dashboardProvider = undefined;
}
