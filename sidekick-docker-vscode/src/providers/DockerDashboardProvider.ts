import * as vscode from 'vscode';
import { getRandomPhrase, errorMessage, shortId, ComposeFileReader } from 'sidekick-docker-shared';
import { getNonce } from '../utils/nonce';
import { DockerService } from '../services/DockerService';
import type { DashboardViewState } from '../services/DockerService';
import { getSettings } from '../settings';
import { resolveComposeCwd } from '../utils/workspace';
import { getDashboardHtml } from './dashboardHtml';
import { ACTION_META, runDockerAction } from './actionRegistry';
import type { ExtensionMessage, WebviewMessage } from '../types/messages';
import { WebviewMessageSchema } from '../types/messageSchemas';

type PanelId = 'containers' | 'services' | 'images' | 'volumes' | 'networks';

const PANEL_IDS: PanelId[] = ['containers', 'services', 'images', 'volumes', 'networks'];
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
  private viewState = { ...DEFAULT_VIEW_STATE };
  private workspaceFoldersSubscription: vscode.Disposable;

  constructor(extensionUri: vscode.Uri) {
    this.extensionUri = extensionUri;
    // Compose cwd depends on workspace folders; re-resolve when they change.
    this.workspaceFoldersSubscription = vscode.workspace.onDidChangeWorkspaceFolders(() => {
      this.reinitializeService();
    });
  }

  open(containerId?: string, viewColumn?: vscode.ViewColumn): void {
    if (containerId) {
      this.pendingFocusContainerId = containerId;
    }

    if (this.panel) {
      this.panel.reveal();
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
      viewColumn ?? vscode.ViewColumn.One,
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
    this.viewState = { ...DEFAULT_VIEW_STATE, visible: panel.visible };

    panel.webview.onDidReceiveMessage(
      (raw: unknown) => {
        const result = WebviewMessageSchema.safeParse(raw);
        if (result.success) this._handleMessage(result.data);
      },
      undefined,
      this.disposables
    );

    panel.onDidDispose(() => {
      this._cleanup();
      this.panel = undefined;
    }, null, this.disposables);

    panel.onDidChangeViewState(() => {
      this.viewState.visible = this.panel?.visible ?? false;
      void this.service?.setVisible(this.viewState.visible);
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
        this.viewState.detailTabIndex = 0;
        this._updateComposeSelection(message.panelId, message.itemId);
        if (message.panelId === 'containers') {
          await this.service?.selectContainer(message.itemId);
        } else if (message.panelId === 'images') {
          await this.service?.selectImage(message.itemId);
        }
        this._syncServiceViewState();
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

      case 'requestRefresh':
        if (this.service) {
          await this.service.forceRefresh();
        } else {
          // No live service (e.g. the initial connect failed): treat F5 as
          // a retry instead of a silent no-op.
          await this._initializeService();
        }
        break;

      case 'retryConnect':
        await this._initializeService();
        break;

      case 'copyLogs':
        await vscode.env.clipboard.writeText(message.text);
        this._postMessage({ type: 'toast', message: 'Logs copied to clipboard', severity: 'info' });
        break;

      case 'toggleCompareItem': {
        const currentCompare = this.viewState.compareItemId;
        const newCompare = currentCompare === message.itemId ? null : message.itemId;
        this.viewState.compareItemId = newCompare;
        // Parse compose fields if on services panel
        if (message.panelId === 'services' && newCompare) {
          const parts = newCompare.split(':');
          if (parts[0] === 'project') {
            this.viewState.compareComposeProjectName = parts.slice(1).join(':');
            this.viewState.compareComposeServiceName = null;
          } else if (parts[0] === 'service') {
            this.viewState.compareComposeProjectName = parts[1];
            this.viewState.compareComposeServiceName = parts.slice(2).join(':');
          }
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
   * Recreate the DockerService with current settings and workspace state.
   * Called when settings or workspace folders change while a dashboard is open.
   */
  reinitializeService(): void {
    if (!this.panel || !this.webviewReady) return;
    void this._initializeService();
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

    const settings = getSettings();
    const cwd = await resolveComposeCwd(new ComposeFileReader());
    if (generation !== this.initGeneration) return;

    const service = new DockerService({
      onStateChange: (snapshot) => {
        this._postMessage({ type: 'updateState', snapshot });
      },
      onLogsChange: (containerId, entries, severityCounts) => {
        this._postMessage({ type: 'updateLogs', containerId, entries, severityCounts });
      },
      onStatsChange: (data) => {
        this._postMessage({ type: 'updateStats', ...data });
      },
      onComposeLogs: (projectName, serviceName, entries) => {
        this._postMessage({ type: 'updateComposeLogs', projectName, serviceName, entries });
      },
      onEnvLoaded: (containerId, env) => {
        this._postMessage({ type: 'updateEnv', containerId, env });
      },
      onChangesLoaded: (containerId, changes) => {
        this._postMessage({ type: 'updateChanges', containerId, changes });
      },
      onLayersLoaded: (imageId, layers) => {
        this._postMessage({ type: 'updateLayers', imageId, layers });
      },
      onError: (message) => {
        this._postMessage({ type: 'toast', message, severity: 'error' });
      },
    }, {
      clientOptions: settings.clientOptions,
      refreshIntervalMs: settings.refreshIntervalMs,
      cwd,
    });

    const ok = await service.initialize();
    if (generation !== this.initGeneration) {
      // Superseded while connecting: only the newest run may own
      // this.service or post connection messages.
      service.dispose();
      return;
    }
    if (!ok) {
      service.dispose();
      this._postMessage({ type: 'connectionState', state: 'disconnected' });
      this._postMessage({
        type: 'toast',
        message: 'Cannot connect to Docker daemon. Is Docker running?',
        severity: 'error',
      });
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

    const parts = itemId.split(':');
    if (parts[0] === 'project') {
      this.viewState.composeProjectName = parts.slice(1).join(':');
      this.viewState.composeServiceName = null;
      return;
    }
    if (parts[0] === 'service') {
      this.viewState.composeProjectName = parts[1] ?? null;
      this.viewState.composeServiceName = parts.slice(2).join(':') || null;
      return;
    }

    this.viewState.composeProjectName = null;
    this.viewState.composeServiceName = null;
  }

  private _syncServiceViewState(): void {
    this.service?.setViewState(this.viewState);
  }

  private async _handleAction(actionType: string, itemId: string, panelId: string): Promise<void> {
    if (!this.service) return;
    const service = this.service;

    const meta = ACTION_META[actionType];
    // Prune acts on the whole resource type, not the selected item.
    const itemName = actionType === 'prune' ? panelId : service.getItemDisplayName(panelId, itemId);

    // Resolves to an outcome string when the action has something more
    // specific to report than its generic success message (e.g. prune).
    const run = async (): Promise<string | undefined> => {
      switch (panelId) {
        case 'containers':
          switch (actionType) {
            case 'start': await service.startContainer(itemId); break;
            case 'stop': await service.stopContainer(itemId); break;
            case 'restart': await service.restartContainer(itemId); break;
            case 'pause': await service.pauseContainer(itemId); break;
            case 'unpause': await service.unpauseContainer(itemId); break;
            case 'remove': await service.removeContainer(itemId); break;
          }
          break;

        case 'services': {
          // itemId format: "project:projectName" or "service:projectName:serviceName"
          const parts = itemId.split(':');
          if (parts[0] === 'project') {
            const projectName = parts.slice(1).join(':');
            switch (actionType) {
              case 'up': await service.composeUp(projectName); break;
              case 'down': await service.composeDown(projectName); break;
              case 'restart': await service.composeRestart(projectName); break;
              case 'stop': await service.composeStop(projectName); break;
            }
          } else if (parts[0] === 'service') {
            const projectName = parts[1];
            const serviceName = parts.slice(2).join(':');
            switch (actionType) {
              case 'up': await service.composeUp(projectName); break;
              case 'down': await service.composeDown(projectName); break;
              case 'restart': await service.composeRestart(projectName, serviceName); break;
              case 'stop': await service.composeStop(projectName, serviceName); break;
            }
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

    try {
      if (meta) {
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
      this._postMessage({
        type: 'toast',
        message: `${actionType} ${itemName} failed: ${errorMessage(err)}`,
        severity: 'error',
      });
    }
  }

  private _openExecTerminal(containerId: string): void {
    const name = this.service?.getContainerName(containerId) ?? shortId(containerId);
    const terminal = vscode.window.createTerminal({
      name: `Exec: ${name}`,
      shellPath: 'docker',
      shellArgs: ['exec', '-it', containerId, getSettings().execShell],
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
