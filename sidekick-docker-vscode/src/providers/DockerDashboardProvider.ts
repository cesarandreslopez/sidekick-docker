import * as vscode from 'vscode';
import { getRandomPhrase, errorMessage, shortId, ComposeFileReader, publishedPortUrls, browserHostForEndpoint, actionFailedText } from 'sidekick-docker-shared';
import type { ActionType } from 'sidekick-docker-shared';
import { getNonce } from '../utils/nonce';
import { DockerService } from '../services/DockerService';
import type { DashboardViewState } from '../services/DockerService';
import { getSettings } from '../settings';
import { resolveComposeCwd } from '../utils/workspace';
import { getDashboardHtml } from './dashboardHtml';
import { ACTION_META, runDockerAction } from './actionRegistry';
import { runComposeAction, isComposeCancelled, composeCancelledText, showComposeError } from './composeRunner';
import type { ComposeAction, ComposeOutput, ComposeRunHooks } from './composeRunner';
import { InFlightActions, alreadyRunningText } from './inFlight';
import type { ExtensionMessage, WebviewMessage } from '../types/messages';
import { WebviewMessageSchema } from '../types/messageSchemas';
import { parseComposeItemId, composeProjectNameOf } from '../types/composeItemId';
import { CONTAINER_FILES_TAB_INDEX } from '../types/detailTabs';

type PanelId = 'containers' | 'services' | 'images' | 'volumes' | 'networks';

const PANEL_IDS: PanelId[] = ['containers', 'services', 'images', 'volumes', 'networks'];
const COMPOSE_ACTIONS: readonly ComposeAction[] = ['up', 'down', 'restart', 'stop'];
const DEFAULT_VIEW_STATE = {
  activePanelId: 'containers' as PanelId,
  detailTabIndex: 0,
  selectedItemId: null as string | null,
  composeProjectName: null as string | null,
  composeServiceName: null as string | null,
  compareItemId: null as string | null,
  compareComposeProjectName: null as string | null,
  compareComposeServiceName: null as string | null,
  sortField: 'state' as DashboardViewState['sortField'],
  visible: true,
};

export class DockerDashboardProvider implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private service: DockerService | undefined;
  private disposables: vscode.Disposable[] = [];
  private extensionUri: vscode.Uri;
  private pendingFocusContainerId: string | null = null;
  private webviewReady = false;
  /** Monotonic guard making _initializeService single-flight (newest run wins). */
  private initGeneration = 0;
  /** A connect is in flight (the newest _initializeService has not settled). */
  private initializing = false;
  private viewState = { ...DEFAULT_VIEW_STATE };
  private workspaceFoldersSubscription: vscode.Disposable;
  /** The "Sidekick Docker" output channel compose actions stream into. */
  private readonly output: ComposeOutput | undefined;
  /** Actions still running, per item and action (survives a service re-init). */
  private readonly inFlight = new InFlightActions();

  constructor(extensionUri: vscode.Uri, output?: ComposeOutput) {
    this.extensionUri = extensionUri;
    this.output = output;
    // Compose cwd depends on workspace folders; re-resolve when they change.
    this.workspaceFoldersSubscription = vscode.workspace.onDidChangeWorkspaceFolders(() => {
      this.reinitializeService();
    });
  }

  /**
   * @param viewColumn Where to show it; only moves an open dashboard when given.
   * @param preserveFocus Keep focus where it is (a tree row click, so arrowing
   *   through the tree keeps working).
   */
  open(containerId?: string, viewColumn?: vscode.ViewColumn, preserveFocus = false): void {
    if (containerId) {
      this.pendingFocusContainerId = containerId;
    }

    if (this.panel) {
      // reveal(undefined) keeps the current column; "Open to the Side" moves it.
      this.panel.reveal(viewColumn, preserveFocus);
      // If webview is already ready, send focus immediately
      if (this.webviewReady && this.pendingFocusContainerId) {
        this._postMessage({ type: 'focusContainer', containerId: this.pendingFocusContainerId });
        this.pendingFocusContainerId = null;
      }
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'sidekick-docker.dashboard',
      'Sidekick Docker',
      { viewColumn: viewColumn ?? vscode.ViewColumn.One, preserveFocus },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: this._localResourceRoots(),
      }
    );

    panel.webview.html = getDashboardHtml(panel.webview, this.extensionUri, getNonce());
    this._adoptPanel(panel);
  }

  /** Re-attach a webview panel revived by the panel serializer after a window reload. */
  restore(panel: vscode.WebviewPanel): void {
    if (this.panel) {
      // A dashboard is already open; drop the revived duplicate.
      panel.dispose();
      return;
    }
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: this._localResourceRoots(),
    };
    panel.webview.html = getDashboardHtml(panel.webview, this.extensionUri, getNonce());
    this._adoptPanel(panel);
  }

  private _localResourceRoots(): vscode.Uri[] {
    return [
      vscode.Uri.joinPath(this.extensionUri, 'out', 'webview'),
      vscode.Uri.joinPath(this.extensionUri, 'images'),
    ];
  }

  private _adoptPanel(panel: vscode.WebviewPanel): void {
    this.panel = panel;
    // The editor tab showed a generic page icon, indistinguishable from any
    // other webview; a revived panel needs it set again too.
    panel.iconPath = vscode.Uri.joinPath(this.extensionUri, 'images', 'icon-64.png');
    this.viewState = { ...DEFAULT_VIEW_STATE, visible: panel.visible };

    panel.webview.onDidReceiveMessage(
      (raw: unknown) => {
        const result = WebviewMessageSchema.safeParse(raw);
        if (!result.success) {
          console.debug('Sidekick Docker: dropped an invalid webview message', result.error.issues);
          return;
        }
        // Handlers are async; a failure (e.g. clipboard write) must surface,
        // not become an unhandled rejection.
        this._handleMessage(result.data).catch((err: unknown) => {
          this._postMessage({ type: 'toast', message: errorMessage(err), severity: 'error' });
        });
      },
      undefined,
      this.disposables
    );

    panel.onDidDispose(() => {
      this._cleanup();
      this.panel = undefined;
    }, null, this.disposables);

    panel.onDidChangeViewState(() => {
      const wasVisible = this.viewState.visible;
      this.viewState.visible = this.panel?.visible ?? false;
      void this.service?.setVisible(this.viewState.visible);
      // Coming back to a dashboard whose connect failed: try again rather
      // than show a stale "Cannot connect" banner until Retry is pressed.
      // Only on hidden → visible: this event also fires on focus changes,
      // which would otherwise retry (and toast) on every click while down.
      if (this.viewState.visible && !wasVisible) this.retryIfDisconnected();
    }, null, this.disposables);
  }

  private async _handleMessage(message: WebviewMessage): Promise<void> {
    switch (message.type) {
      case 'webviewReady':
        await this._initializeService();
        break;

      case 'switchPanel':
        this.viewState.activePanelId = PANEL_IDS[message.panelIndex] ?? 'containers';
        this.viewState.detailTabIndex = 0;
        this.viewState.selectedItemId = null;
        this.viewState.compareItemId = null;
        this.viewState.compareComposeProjectName = null;
        this.viewState.compareComposeServiceName = null;
        if (this.viewState.activePanelId !== 'services') {
          this.viewState.composeProjectName = null;
          this.viewState.composeServiceName = null;
        }
        this._syncServiceViewState();
        break;

      case 'switchDetailTab':
        this.viewState.detailTabIndex = message.tabIndex;
        this._syncServiceViewState();
        break;

      case 'sortChanged':
        this.viewState.sortField = message.field;
        this._syncServiceViewState();
        break;

      case 'selectItem':
        this.viewState.activePanelId = message.panelId as PanelId;
        this.viewState.selectedItemId = message.itemId;
        this._updateComposeSelection(message.panelId, message.itemId);
        this._syncServiceViewState();
        if (message.panelId === 'containers') {
          void this.service?.selectContainer(message.itemId);
        } else if (message.panelId === 'images') {
          void this.service?.selectImage(message.itemId);
        }
        break;

      case 'selectComposeService':
        this.viewState.composeProjectName = message.projectName;
        this.viewState.composeServiceName = message.serviceName;
        this._syncServiceViewState();
        break;

      case 'action':
        await this._handleAction(message.actionType, message.itemId, message.panelId);
        break;

      case 'execContainer':
        this._openExecTerminal(message.containerId);
        break;

      case 'retryDetail':
        if (message.itemId === this.viewState.selectedItemId) await this.service?.loadDetail(message.kind, message.itemId, true);
        break;

      case 'retryStreams':
        this.service?.retryStreams();
        break;

      case 'requestRefresh':
        await this.refresh();
        break;

      case 'retryConnect':
        await this._initializeService();
        break;

      case 'copyLogs':
        await vscode.env.clipboard.writeText(message.text);
        this._postMessage({ type: 'toast', message: 'Logs copied to clipboard', severity: 'info' });
        break;

      case 'copyText':
        await vscode.env.clipboard.writeText(message.text);
        this._postMessage({ type: 'toast', message: 'Copied to clipboard', severity: 'info' });
        break;

      case 'toggleCompareItem': {
        // The webview sends the desired pin, including when restoring a panel.
        const newCompare = message.itemId;
        this.viewState.compareItemId = newCompare;
        // Parse compose fields if on services panel
        if (message.panelId === 'services' && newCompare) {
          const ref = parseComposeItemId(newCompare);
          this.viewState.compareComposeProjectName = ref.kind === 'unknown' ? null : ref.projectName;
          this.viewState.compareComposeServiceName = ref.kind === 'service' ? ref.serviceName : null;
        } else {
          this.viewState.compareComposeProjectName = null;
          this.viewState.compareComposeServiceName = null;
        }
        this._syncServiceViewState();
        break;
      }
    }
  }

  /**
   * F5 in the dashboard (the sidekick-docker.refreshDashboard keybinding; the
   * webview no longer handles F5 itself, or it refreshed twice).
   */
  async refreshFromKeybinding(): Promise<void> {
    if (!this.panel) return;
    this._postMessage({ type: 'toast', message: 'Refreshing\u2026', severity: 'info' });
    await this.refresh();
  }

  /**
   * Re-list everything, and re-read a Files tab that is on screen (filesystem
   * changes are otherwise cached). With no live service — the initial connect
   * failed — this is a retry rather than a silent no-op.
   */
  private async refresh(): Promise<void> {
    if (!this.service) {
      await this._initializeService();
      return;
    }
    const service = this.service;
    await service.forceRefresh();
    const v = this.viewState;
    if (v.activePanelId === 'containers' && v.detailTabIndex === CONTAINER_FILES_TAB_INDEX && v.selectedItemId) {
      await service.loadDetail('changes', v.selectedItemId, true);
    }
  }

  /**
   * Recreate the DockerService with current settings and workspace state.
   * Called when settings or workspace folders change while a dashboard is open.
   */
  reinitializeService(): void {
    if (!this.panel || !this.webviewReady) return;
    void this._initializeService();
  }

  /**
   * Connect again if the dashboard is open, its webview is up, and the last
   * connect failed (no service). Called when the always-on watcher sees
   * Docker come back and when the panel becomes visible — there is no
   * dashboard timer of its own. A connect already in flight is left to settle.
   */
  retryIfDisconnected(): void {
    if (!this.panel || !this.webviewReady || this.service || this.initializing) return;
    void this._initializeService();
  }

  /** Apply a new fallback refresh interval in place (keeps streams, logs and sparklines). */
  setRefreshInterval(ms: number): void {
    this.service?.setRefreshInterval(ms);
  }

  private async _initializeService(): Promise<void> {
    // Single-flight: each call claims a new generation; after every await an
    // older (stale) run must dispose whatever it created locally and bail,
    // so overlapping calls (double retry click, settings change mid-init,
    // panel closed mid-init) never orphan a polling service or dispose a
    // newer run's service.
    const generation = ++this.initGeneration;
    this.service?.dispose();
    this.service = undefined;
    this.webviewReady = true;
    this.initializing = true;
    // The list on screen belongs to the service just disposed: the webview
    // keeps it inert (and any "Cannot connect" banner up) until this settles.
    this._postMessage({ type: 'connectionState', state: 'connecting' });
    try {
      await this._connect(generation);
    } catch (err: unknown) {
      // Never leave the webview on "Connecting…" with Retry disabled.
      if (generation === this.initGeneration) {
        this._postMessage({ type: 'connectionState', state: 'disconnected', reason: errorMessage(err) });
      }
    } finally {
      if (generation === this.initGeneration) this.initializing = false;
    }
  }

  private async _connect(generation: number): Promise<void> {
    const settings = getSettings();
    const cwd = await resolveComposeCwd(new ComposeFileReader(settings.cliEnv));
    if (generation !== this.initGeneration) return;

    const post = (message: ExtensionMessage) => {
      if (generation === this.initGeneration) this._postMessage(message);
    };
    const service = new DockerService({
      onStateChange: (snapshot) => {
        post({ type: 'updateState', snapshot });
      },
      onLogsChange: (containerId, entries, severityCounts) => {
        post({ type: 'updateLogs', containerId, entries, severityCounts });
      },
      onStatsChange: (data) => {
        post({ type: 'updateStats', ...data });
      },
      onComposeLogs: (projectName, serviceName, entries) => {
        post({ type: 'updateComposeLogs', projectName, serviceName, entries });
      },
      onDetailsLoaded: (containerId, details) => {
        post({ type: 'updateInspect', containerId, details });
      },
      onChangesLoaded: (containerId, changes, fetchedAt) => {
        post({ type: 'updateChanges', containerId, changes, fetchedAt });
      },
      onLayersLoaded: (imageId, layers) => {
        post({ type: 'updateLayers', imageId, layers });
      },
      onDetailLoad: (update) => post({ type: 'detailLoad', update }),
      onStreamState: (update) => post({ type: 'streamState', update }),
    }, {
      clientOptions: settings.clientOptions,
      cliEnv: settings.cliEnv,
      refreshIntervalMs: settings.refreshIntervalMs,
      cwd,
      isTrusted: vscode.workspace.isTrusted,
      visible: this.viewState.visible,
      endpoint: settings.socketPath,
    });

    const result = await service.initialize();
    if (generation !== this.initGeneration) {
      // Superseded while connecting: only the newest run may own
      // this.service or post connection messages.
      service.dispose();
      return;
    }
    if (!result.ok) {
      service.dispose();
      this._postMessage({ type: 'connectionState', state: 'disconnected', reason: result.reason });
      this._postMessage({ type: 'toast', message: result.reason, severity: 'error' });
      return;
    }

    this.service = service;
    this._postMessage({ type: 'connectionState', state: 'connected' });
    this._postMessage({ type: 'updateState', snapshot: service.getStateSnapshot() });

    // Send phrase bank for local rotation in webview
    const phrases = Array.from({ length: 50 }, () => getRandomPhrase());
    this._postMessage({ type: 'phraseBank', phrases });

    // Send pending focus container if any
    if (this.pendingFocusContainerId) {
      this._postMessage({ type: 'focusContainer', containerId: this.pendingFocusContainerId });
      this.pendingFocusContainerId = null;
    }

    service.setViewState(this.viewState);
    // Re-trigger one-shot fetches (env/changes/layers) for a selection that was
    // restored or made before the service finished (re)initializing.
    if (this.viewState.selectedItemId) {
      if (this.viewState.activePanelId === 'containers') {
        void service.selectContainer(this.viewState.selectedItemId);
      } else if (this.viewState.activePanelId === 'images') {
        void service.selectImage(this.viewState.selectedItemId);
      }
    }
    await service.setVisible(this.viewState.visible);
  }

  private _updateComposeSelection(panelId: string, itemId: string | null): void {
    if (panelId !== 'services' || !itemId) {
      this.viewState.composeProjectName = null;
      this.viewState.composeServiceName = null;
      return;
    }

    const ref = parseComposeItemId(itemId);
    this.viewState.composeProjectName = ref.kind === 'unknown' ? null : ref.projectName;
    this.viewState.composeServiceName = ref.kind === 'service' ? (ref.serviceName || null) : null;
  }

  private _syncServiceViewState(): void {
    this.service?.setViewState(this.viewState);
  }

  private async _handleAction(actionType: string, itemId: string, panelId: string): Promise<void> {
    if (!this.service) {
      // The last connect failed (or is still running): say so instead of
      // silently dropping the key press.
      this._postMessage({ type: 'toast', message: 'Not connected to Docker', severity: 'warning' });
      return;
    }
    const service = this.service;
    if (actionType === 'openPort') {
      await this._openPublishedPort(itemId);
      return;
    }

    const meta = ACTION_META[actionType];
    // Prune acts on the whole resource type, not the selected item; compose
    // Up/Down act on the whole project even from a service row, so name it.
    const itemName = actionType === 'prune' ? panelId
      : panelId === 'services' && (actionType === 'up' || actionType === 'down') ? composeProjectNameOf(itemId) ?? itemId
      : service.getItemDisplayName(panelId, itemId);

    // Compose on the Services panel streams its output into the output
    // channel, and up/down/restart can be cancelled from their progress
    // notification.
    const composeAction = panelId === 'services' && COMPOSE_ACTIONS.includes(actionType as ComposeAction) ? actionType as ComposeAction : null;

    // Resolves to an outcome string when the action has something more
    // specific to report than its generic success message (e.g. prune).
    const run = async (hooks?: ComposeRunHooks): Promise<string | undefined> => {
      switch (panelId) {
        case 'containers':
          switch (actionType) {
            case 'start': await service.startContainer(itemId); break;
            case 'stop': await service.stopContainer(itemId); break;
            case 'restart': await service.restartContainer(itemId); break;
            case 'pause': await service.pauseContainer(itemId); break;
            case 'unpause': await service.unpauseContainer(itemId); break;
            case 'remove': await service.removeContainer(itemId); break;
            case 'prune': return await service.pruneContainers();
          }
          break;

        case 'services': {
          const ref = parseComposeItemId(itemId);
          if (ref.kind === 'unknown') break;
          // up/down always act on the whole project; restart/stop narrow to a
          // single service when the row is one.
          const serviceName = ref.kind === 'service' ? ref.serviceName : undefined;
          switch (actionType) {
            case 'up': await service.composeUp(ref.projectName, hooks); break;
            case 'down': await service.composeDown(ref.projectName, hooks); break;
            case 'restart': await service.composeRestart(ref.projectName, serviceName, hooks); break;
            case 'stop': await service.composeStop(ref.projectName, serviceName, hooks); break;
          }
          break;
        }

        case 'images':
          switch (actionType) {
            case 'remove': await service.removeImage(itemId); break;
            case 'prune': return await service.pruneImages();
          }
          break;

        case 'volumes':
          switch (actionType) {
            case 'remove': await service.removeVolume(itemId); break;
            case 'prune': return await service.pruneVolumes();
          }
          break;

        case 'networks':
          switch (actionType) {
            case 'remove': await service.removeNetwork(itemId); break;
            case 'prune': return await service.pruneNetworks();
          }
          break;
      }
      // Most actions have nothing to add beyond the generic success message.
      return undefined;
    };

    // One run per item and action at a time: a second press while the first
    // still runs is ignored (with a short note) instead of issuing a second
    // Docker call. Prune is per panel, compose up/down per project.
    const target = actionType === 'prune' ? '' : panelId === 'services' && (actionType === 'up' || actionType === 'down') ? itemName : itemId;
    const onDuplicate = () => this._postMessage({ type: 'toast', message: alreadyRunningText(actionType, itemName), severity: 'info' });
    await this.inFlight.run(`${panelId}:${actionType}:${target}`, async () => {
      try {
        if (composeAction) {
          await runComposeAction(composeAction, itemName, this.output, run);
          this._postMessage({ type: 'toast', message: ACTION_META[composeAction].successMessage(itemName), severity: 'success' });
        } else if (meta) {
          // Slow ops get a native progress notification (survives panel hide).
          // Prefer the action's own outcome text when it has one (prune reports
          // reclaimed space) over the generic success message.
          const detail = await runDockerAction(meta, itemName, run);
          this._postMessage({ type: 'toast', message: detail ?? meta.successMessage(itemName), severity: 'success' });
        } else {
          await run();
          this._postMessage({ type: 'toast', message: actionType, severity: 'success' });
        }
      } catch (err: unknown) {
        if (composeAction && isComposeCancelled(err)) {
          // Cancelled from the progress notification: not a failure.
          this._postMessage({ type: 'toast', message: composeCancelledText(composeAction, itemName), severity: 'info' });
          return;
        }
        // ACTION_META has an entry for exactly the shared ActionTypes.
        const message = meta ? actionFailedText(actionType as ActionType, itemName, errorMessage(err)) : `${actionType} ${itemName} failed: ${errorMessage(err)}`;
        // A toast has room for the reason only; compose's full output is in the channel.
        const toast = composeAction && this.output ? `${message} (full output: Output › Sidekick Docker)` : message;
        this._postMessage({ type: 'toast', message: toast, severity: 'error' });
        // A slow action outlives the panel being on screen; its failure must not
        // land only in a hidden webview.
        if (!this.panel?.visible) this._notifyHiddenFailure(message, composeAction !== null);
      }
    }, onDuplicate);
  }

  private _notifyHiddenFailure(message: string, compose: boolean): void {
    const openDashboard = { label: 'Open Dashboard', run: () => this.open() };
    if (compose) {
      showComposeError(message, this.output, [openDashboard]);
      return;
    }
    void vscode.window.showErrorMessage(message, openDashboard.label).then((choice) => {
      if (choice === openDashboard.label) openDashboard.run();
    });
  }

  /**
   * Open a container's published port in the browser. asExternalUri maps
   * localhost through Remote-SSH/WSL/Codespaces port forwarding, so the link
   * works where the editor runs, not just where the extension host does.
   */
  private async _openPublishedPort(containerId: string): Promise<void> {
    const container = this.service?.getStateSnapshot().containers.find(c => c.id === containerId);
    if (!container) return;
    const host = browserHostForEndpoint(getSettings().socketPath || process.env.DOCKER_HOST);
    const urls = publishedPortUrls(container.ports, host);
    if (urls.length === 0) {
      this._postMessage({ type: 'toast', message: `${container.name} publishes no TCP ports`, severity: 'warning' });
      return;
    }
    const url = urls.length === 1 ? urls[0] : await vscode.window.showQuickPick(urls, { placeHolder: `Open which port of ${container.name}?` });
    if (!url) return;
    const external = await vscode.env.asExternalUri(vscode.Uri.parse(url));
    await vscode.env.openExternal(external);
  }

  private _openExecTerminal(containerId: string): void {
    const name = this.service?.getContainerName(containerId) ?? shortId(containerId);
    const settings = getSettings();
    const terminal = vscode.window.createTerminal({
      name: `Exec: ${name}`,
      shellPath: 'docker',
      shellArgs: ['exec', '-it', containerId, settings.execShell],
      // Without this the spawned `docker` ignores the socketPath setting and
      // execs into whatever the default daemon has, not what is on screen.
      env: settings.cliEnv,
    });
    terminal.show();
  }

  private _postMessage(message: ExtensionMessage): void {
    this.panel?.webview.postMessage(message);
  }

  private _cleanup(): void {
    // Invalidate any in-flight _initializeService run so it disposes its
    // service instead of committing it after the panel is gone.
    this.initGeneration++;
    this.initializing = false;
    this.service?.dispose();
    this.service = undefined;
    this.webviewReady = false;
    this.pendingFocusContainerId = null;
    this.viewState = { ...DEFAULT_VIEW_STATE };
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }

  dispose(): void {
    this._cleanup();
    this.workspaceFoldersSubscription.dispose();
    this.panel?.dispose();
    this.panel = undefined;
  }
}
