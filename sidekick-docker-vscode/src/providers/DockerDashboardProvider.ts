import * as vscode from 'vscode';
import { getRandomPhrase, errorMessage, shortId } from 'sidekick-docker-shared';
import { getNonce } from '../utils/nonce';
import { DockerService } from '../services/DockerService';
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
  sortField: 'state' as const,
  visible: true,
};

export class DockerDashboardProvider implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private service: DockerService | undefined;
  private disposables: vscode.Disposable[] = [];
  private extensionUri: vscode.Uri;
  private pendingFocusContainerId: string | null = null;
  private webviewReady = false;
  private viewState = { ...DEFAULT_VIEW_STATE };

  constructor(extensionUri: vscode.Uri) {
    this.extensionUri = extensionUri;
  }

  open(containerId?: string): void {
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

    this.panel = vscode.window.createWebviewPanel(
      'sidekick-docker.dashboard',
      'Sidekick Docker',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionUri, 'out', 'webview'),
          vscode.Uri.joinPath(this.extensionUri, 'images'),
        ],
      }
    );

    this.panel.webview.html = this._getHtmlForWebview(this.panel.webview);
    this.viewState = { ...DEFAULT_VIEW_STATE, visible: this.panel.visible };

    this.panel.webview.onDidReceiveMessage(
      (raw: unknown) => {
        const result = WebviewMessageSchema.safeParse(raw);
        if (result.success) this._handleMessage(result.data);
      },
      undefined,
      this.disposables
    );

    this.panel.onDidDispose(() => {
      this._cleanup();
      this.panel = undefined;
    }, null, this.disposables);

    this.panel.onDidChangeViewState(() => {
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
        await this.service?.forceRefresh();
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

  private async _initializeService(): Promise<void> {
    this.service?.dispose();
    this.webviewReady = true;

    this.service = new DockerService({
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
    });

    const ok = await this.service.initialize();
    if (!ok) {
      this.service.dispose();
      this.service = undefined;
      this._postMessage({
        type: 'toast',
        message: 'Cannot connect to Docker daemon. Is Docker running?',
        severity: 'error',
      });
      return;
    }

    this._postMessage({ type: 'updateState', snapshot: this.service.getStateSnapshot() });

    // Send phrase bank for local rotation in webview
    const phrases = Array.from({ length: 50 }, () => getRandomPhrase());
    this._postMessage({ type: 'phraseBank', phrases });

    // Send pending focus container if any
    if (this.pendingFocusContainerId) {
      this._postMessage({ type: 'focusContainer', containerId: this.pendingFocusContainerId });
      this.pendingFocusContainerId = null;
    }

    this.service.setViewState(this.viewState);
    await this.service.setVisible(this.viewState.visible);
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

    // In-progress feedback
    this._postMessage({ type: 'toast', message: `${actionType}\u2026`, severity: 'info' });

    try {
      switch (panelId) {
        case 'containers':
          switch (actionType) {
            case 'start': await this.service.startContainer(itemId); break;
            case 'stop': await this.service.stopContainer(itemId); break;
            case 'restart': await this.service.restartContainer(itemId); break;
            case 'pause': await this.service.pauseContainer(itemId); break;
            case 'unpause': await this.service.unpauseContainer(itemId); break;
            case 'remove': await this.service.removeContainer(itemId); break;
          }
          break;

        case 'services': {
          // itemId format: "project:projectName" or "service:projectName:serviceName"
          const parts = itemId.split(':');
          if (parts[0] === 'project') {
            const projectName = parts.slice(1).join(':');
            switch (actionType) {
              case 'up': await this.service.composeUp(projectName); break;
              case 'down': await this.service.composeDown(projectName); break;
              case 'restart': await this.service.composeRestart(projectName); break;
              case 'stop': await this.service.composeStop(projectName); break;
            }
          } else if (parts[0] === 'service') {
            const projectName = parts[1];
            const serviceName = parts.slice(2).join(':');
            switch (actionType) {
              case 'up': await this.service.composeUp(projectName); break;
              case 'down': await this.service.composeDown(projectName); break;
              case 'restart': await this.service.composeRestart(projectName, serviceName); break;
              case 'stop': await this.service.composeStop(projectName, serviceName); break;
            }
          }
          break;
        }

        case 'images':
          switch (actionType) {
            case 'remove': await this.service.removeImage(itemId); break;
            case 'prune': await this.service.pruneImages(); break;
          }
          break;

        case 'volumes':
          switch (actionType) {
            case 'remove': await this.service.removeVolume(itemId); break;
            case 'prune': await this.service.pruneVolumes(); break;
          }
          break;

        case 'networks':
          switch (actionType) {
            case 'remove': await this.service.removeNetwork(itemId); break;
            case 'prune': await this.service.pruneNetworks(); break;
          }
          break;
      }

      this._postMessage({ type: 'toast', message: actionType, severity: 'success' });
    } catch (err: unknown) {
      this._postMessage({ type: 'toast', message: `${actionType} failed: ${errorMessage(err)}`, severity: 'error' });
    }
  }

  private _openExecTerminal(containerId: string): void {
    const name = this.service?.getContainerName(containerId) ?? shortId(containerId);
    const terminal = vscode.window.createTerminal({
      name: `Exec: ${name}`,
      shellPath: 'docker',
      shellArgs: ['exec', '-it', containerId, '/bin/sh'],
    });
    terminal.show();
  }

  private _postMessage(message: ExtensionMessage): void {
    this.panel?.webview.postMessage(message);
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = getNonce();
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'out', 'webview', 'dashboard.js')
    );
    const iconUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'images', 'icon-64.png')
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none';
                 img-src ${webview.cspSource};
                 style-src ${webview.cspSource} 'unsafe-inline';
                 script-src 'nonce-${nonce}';">
  <title>Sidekick Docker</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      --side-width: 250px;
      --tab-height: 36px;
      --status-height: 28px;
      --detail-tab-height: 30px;
    }
    body {
      font-family: var(--vscode-font-family, 'Segoe WPC', 'Segoe UI', sans-serif);
      font-size: var(--vscode-font-size, 13px);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      overflow: hidden;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }

    /* ─── Tab bar ──────────────────────────────────────────────── */
    #tab-bar {
      display: flex;
      align-items: center;
      height: var(--tab-height);
      background: var(--vscode-tab-inactiveBackground, var(--vscode-editor-background));
      border-bottom: 1px solid var(--vscode-panel-border, var(--vscode-editorGroup-border));
      flex-shrink: 0;
      overflow: hidden;
    }
    #tab-bar .tab {
      padding: 0 14px;
      height: 100%;
      display: flex;
      align-items: center;
      cursor: pointer;
      white-space: nowrap;
      color: var(--vscode-tab-inactiveForeground, var(--vscode-foreground));
      border-bottom: 2px solid transparent;
      font-size: 12px;
      user-select: none;
      transition: background 0.1s ease;
    }
    #tab-bar .tab:hover {
      background: var(--vscode-tab-hoverBackground, rgba(255,255,255,0.05));
    }
    #tab-bar .tab.active {
      color: var(--vscode-tab-activeForeground, var(--vscode-foreground));
      border-bottom-color: var(--vscode-tab-activeBorderTop, var(--vscode-focusBorder));
      background: var(--vscode-tab-activeBackground, var(--vscode-editor-background));
    }
    #tab-bar .tab .shortcut {
      color: var(--vscode-descriptionForeground);
      margin-right: 4px;
      font-size: 11px;
    }
    #tab-bar .phrase {
      margin-left: auto;
      padding-right: 14px;
      color: var(--vscode-descriptionForeground);
      font-style: italic;
      font-size: 11px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 50%;
    }

    /* ─── Main area ────────────────────────────────────────────── */
    #main-area {
      display: flex;
      flex-grow: 1;
      overflow: hidden;
    }

    /* ─── Side list ────────────────────────────────────────────── */
    #side-list {
      width: var(--side-width);
      min-width: var(--side-width);
      border-right: 1px solid var(--vscode-panel-border, var(--vscode-editorGroup-border));
      overflow-y: auto;
      flex-shrink: 0;
    }
    #side-list .side-group-header {
      padding: 6px 12px 2px;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--vscode-descriptionForeground);
      user-select: none;
    }
    #side-list .side-item {
      padding: 4px 12px;
      cursor: pointer;
      font-size: 12px;
      user-select: none;
      display: flex;
      align-items: center;
      border-left: 3px solid transparent;
      transition: background 0.12s ease;
    }
    #side-list .side-item .side-label {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1;
      min-width: 0;
    }
    #side-list .side-item .side-badge {
      margin-left: auto;
      padding-left: 8px;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      white-space: nowrap;
      flex-shrink: 0;
    }
    #side-list .side-item:hover {
      background: var(--vscode-list-hoverBackground);
    }
    #side-list .side-item.selected {
      background: var(--vscode-list-activeSelectionBackground);
      color: var(--vscode-list-activeSelectionForeground);
      border-left-color: var(--vscode-focusBorder, #2B4C7E);
    }
    #side-list .side-item.selected .side-badge {
      color: var(--vscode-list-activeSelectionForeground);
      opacity: 0.7;
    }
    #side-list .side-item .pin-btn {
      display: none;
      margin-left: 4px;
      cursor: pointer;
      font-size: 11px;
      opacity: 0.5;
      flex-shrink: 0;
    }
    #side-list .side-item:hover .pin-btn,
    #side-list .side-item .pin-btn.active {
      display: inline;
    }
    #side-list .side-item .pin-btn.active {
      opacity: 1;
    }
    #side-list .side-item.pinned {
      border-left-color: var(--vscode-textLink-foreground, #3794ff);
    }

    /* ─── Detail pane ──────────────────────────────────────────── */
    #detail-pane {
      flex-grow: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    #detail-tab-bar {
      display: flex;
      align-items: center;
      height: var(--detail-tab-height);
      border-bottom: 1px solid var(--vscode-panel-border, var(--vscode-editorGroup-border));
      flex-shrink: 0;
      padding: 0 8px;
      gap: 4px;
    }
    #detail-tab-bar .detail-tab {
      padding: 2px 10px;
      cursor: pointer;
      font-size: 11px;
      border-radius: 3px;
      user-select: none;
      color: var(--vscode-descriptionForeground);
      transition: background 0.1s ease, color 0.1s ease;
    }
    #detail-tab-bar .detail-tab:hover {
      background: var(--vscode-toolbar-hoverBackground, rgba(255,255,255,0.1));
    }
    #detail-tab-bar .detail-tab.active {
      color: var(--vscode-foreground);
      background: var(--vscode-toolbar-activeBackground, rgba(255,255,255,0.15));
    }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    #detail-content {
      flex-grow: 1;
      overflow: auto;
      padding: 10px 14px;
      font-family: var(--vscode-editor-font-family, 'Courier New', monospace);
      font-size: var(--vscode-editor-font-size, 13px);
      line-height: 1.5;
    }
    #detail-content.fade-in {
      animation: fadeIn 0.15s ease;
    }
    .log-content {
      white-space: pre;
      overflow-x: auto;
    }

    /* ─── Compare layout ─────────────────────────────────────────── */
    .log-compare-container {
      display: flex;
      flex-direction: row;
      height: 100%;
      gap: 0;
    }
    .log-compare-pane {
      flex: 1;
      overflow-y: auto;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .log-compare-divider {
      width: 1px;
      background: var(--vscode-panel-border, rgba(128,128,128,0.35));
      flex-shrink: 0;
    }
    .compare-label {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      padding: 2px 8px;
      background: var(--vscode-sideBar-background);
      border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.35));
      flex-shrink: 0;
      font-weight: 600;
    }
    .log-compare-pane .log-shell {
      flex: 1;
      overflow-y: auto;
    }

    /* ─── Custom scrollbars ──────────────────────────────────────── */
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb {
      background: var(--vscode-scrollbarSlider-background, rgba(121,121,121,0.4));
      border-radius: 4px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: var(--vscode-scrollbarSlider-hoverBackground, rgba(100,100,100,0.7));
    }
    ::-webkit-scrollbar-thumb:active {
      background: var(--vscode-scrollbarSlider-activeBackground, rgba(191,191,191,0.4));
    }

    /* ─── Log coloring ─────────────────────────────────────────── */
    .log-line {
      display: flex;
      padding: 0 4px;
    }
    .log-line:nth-child(even) {
      background: rgba(128,128,128,0.04);
    }
    .log-line:hover {
      background: var(--vscode-list-hoverBackground);
    }
    .log-timestamp {
      color: var(--vscode-descriptionForeground);
      opacity: 0.7;
      border-right: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2));
      padding-right: 8px;
      margin-right: 8px;
      font-size: 0.9em;
      user-select: none;
      white-space: nowrap;
    }
    .log-stderr { color: var(--vscode-errorForeground); }
    .log-error { color: var(--vscode-errorForeground); }
    .log-warn { color: var(--vscode-editorWarning-foreground, #cca700); }
    .log-info { color: var(--vscode-editorInfo-foreground, #3794ff); }
    .log-debug { color: var(--vscode-descriptionForeground); }

    /* ─── Token-level log syntax highlighting ────────────────── */
    .tok-sev-error { color: var(--vscode-errorForeground); font-weight: 600; }
    .tok-sev-warn { color: var(--vscode-editorWarning-foreground, #cca700); font-weight: 600; }
    .tok-sev-info { color: var(--vscode-editorInfo-foreground, #3794ff); font-weight: 600; }
    .tok-sev-debug { color: var(--vscode-descriptionForeground); }
    .tok-http-safe { color: var(--vscode-testing-iconPassed, #3fb950); }
    .tok-http-unsafe { color: var(--vscode-editorWarning-foreground, #cca700); }
    .tok-status-2xx { color: var(--vscode-testing-iconPassed, #3fb950); font-weight: 600; }
    .tok-status-3xx { color: var(--vscode-editorInfo-foreground, #3794ff); }
    .tok-status-4xx { color: var(--vscode-editorWarning-foreground, #cca700); font-weight: 600; }
    .tok-status-5xx { color: var(--vscode-errorForeground); font-weight: 600; }
    .tok-url { color: var(--vscode-textLink-foreground, #3794ff); }
    .tok-ip { color: var(--vscode-descriptionForeground); }
    .tok-timestamp { color: var(--vscode-descriptionForeground); opacity: 0.7; }
    .tok-json-key { color: var(--vscode-editorInfo-foreground, #2B4C7E); }
    .tok-state-ok { color: var(--vscode-testing-iconPassed, #3fb950); }
    .tok-state-fail { color: var(--vscode-errorForeground); }
    .tok-path { color: var(--vscode-descriptionForeground); }

    /* ─── Log filter match highlighting ──────────────────────── */
    .log-match {
      background: var(--vscode-editor-findMatchHighlightBackground, rgba(234,178,46,0.4));
      color: inherit;
      border-radius: 2px;
    }

    /* ─── Severity count badges ──────────────────────────────── */
    .severity-counts {
      display: flex;
      gap: 8px;
      padding: 4px 8px;
      margin-bottom: 4px;
      font-size: 0.85em;
      border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2));
    }
    .sev-badge { font-weight: 600; }
    .sev-badge.error { color: var(--vscode-errorForeground); }
    .sev-badge.warn { color: var(--vscode-editorWarning-foreground, #cca700); }
    .sev-badge.info { color: var(--vscode-editorInfo-foreground, #3794ff); }
    .sev-badge.debug { color: var(--vscode-descriptionForeground); }

    /* ─── Log filter search bar ──────────────────────────────── */
    .log-filter-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 8px;
      border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2));
    }
    .log-filter-bar input {
      flex: 1;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, transparent);
      padding: 2px 6px;
      font-family: inherit;
      font-size: inherit;
      border-radius: 2px;
      outline: none;
    }
    .log-filter-bar input:focus {
      border-color: var(--vscode-focusBorder);
    }
    .log-filter-bar .filter-mode {
      font-size: 0.85em;
      color: var(--vscode-descriptionForeground);
      cursor: pointer;
      user-select: none;
    }
    .log-filter-bar .match-count {
      font-size: 0.85em;
      color: var(--vscode-descriptionForeground);
      white-space: nowrap;
    }
    .log-filter-bar .copy-logs-btn {
      font-size: 0.85em;
      color: var(--vscode-descriptionForeground);
      cursor: pointer;
      user-select: none;
      padding: 1px 4px;
      border-radius: 3px;
      transition: background 0.1s ease, color 0.1s ease;
    }
    .log-filter-bar .copy-logs-btn:hover {
      background: var(--vscode-toolbar-hoverBackground, rgba(255,255,255,0.1));
      color: var(--vscode-foreground);
    }

    /* ─── Log pattern clustering ─────────────────────────────── */
    .patterns-list {
      padding: 4px 0;
    }
    .pattern-row {
      display: flex;
      gap: 12px;
      padding: 3px 8px;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.9em;
    }
    .pattern-row:hover {
      background: var(--vscode-list-hoverBackground);
    }
    .pattern-count {
      color: var(--vscode-editorWarning-foreground, #cca700);
      font-weight: 600;
      min-width: 40px;
      text-align: right;
    }
    .pattern-text {
      color: var(--vscode-foreground);
    }

    /* ─── Detail panel coloring ───────────────────────────────── */
    .detail-key { color: var(--vscode-editorInfo-foreground, #2B4C7E); }
    .detail-id { color: var(--vscode-descriptionForeground); opacity: 0.7; }
    .detail-bool-yes { color: var(--vscode-testing-iconPassed, #3fb950); }
    .detail-bool-no { color: var(--vscode-descriptionForeground); opacity: 0.7; }
    .detail-stat-high { color: var(--vscode-errorForeground, #f85149); }
    .detail-stat-med { color: var(--vscode-editorWarning-foreground, #cca700); }
    .env-key { color: var(--vscode-editorInfo-foreground, #2B4C7E); }
    .env-value { }

    /* ─── Stats progress bars ───────────────────────────────────── */
    .stats-grid { display: flex; flex-direction: column; gap: 10px; }
    .stat-row { display: flex; flex-direction: column; gap: 3px; }
    .stat-row-label {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      font-variant-numeric: tabular-nums;
    }
    .stat-row-label .stat-label { color: var(--vscode-descriptionForeground); text-transform: uppercase; letter-spacing: 0.5px; }
    .stat-row-label .stat-value { }
    .stat-bar-track {
      height: 6px;
      background: var(--vscode-editor-inactiveSelectionBackground, rgba(255,255,255,0.08));
      border-radius: 3px;
      overflow: hidden;
    }
    .stat-bar-fill {
      height: 100%;
      border-radius: 3px;
      transition: width 0.4s ease-out;
    }
    .stat-bar-fill.green { background: var(--vscode-testing-iconPassed, #3fb950); }
    .stat-bar-fill.yellow { background: var(--vscode-editorWarning-foreground, #cca700); }
    .stat-bar-fill.red { background: var(--vscode-errorForeground, #f85149); }
    .stat-net {
      display: flex;
      gap: 16px;
      font-size: 12px;
      font-variant-numeric: tabular-nums;
    }
    .stat-net-rx { color: var(--vscode-testing-iconPassed, #3fb950); }
    .stat-net-tx { color: var(--vscode-editorInfo-foreground, #2B4C7E); }
    .stat-pids { color: var(--vscode-descriptionForeground); font-size: 11px; }
    .sparkline-row {
      font-family: var(--vscode-editor-font-family, 'Courier New', monospace);
      font-size: 10px;
      line-height: 1;
      letter-spacing: 0;
      margin-top: 2px;
      overflow: hidden;
    }
    .sparkline { white-space: nowrap; }
    .sparkline-row.cpu .sparkline { color: var(--vscode-editorInfo-foreground, #3794ff); }
    .sparkline-row.memory .sparkline { color: var(--vscode-testing-iconPassed, #3fb950); }

    /* ─── Stats spinner ────────────────────────────────────────── */
    @keyframes spin { to { transform: rotate(360deg); } }
    .stats-spinner {
      display: inline-block;
      width: 14px;
      height: 14px;
      border: 2px solid var(--vscode-descriptionForeground);
      border-top-color: var(--vscode-focusBorder);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      vertical-align: middle;
      margin-right: 6px;
    }

    /* ─── Status bar ───────────────────────────────────────────── */
    #status-bar {
      display: flex;
      align-items: center;
      height: var(--status-height);
      background: var(--vscode-statusBar-background, #2B4C7E);
      color: var(--vscode-statusBar-foreground, #fff);
      font-size: 11px;
      flex-shrink: 0;
      padding: 0 10px;
      gap: 12px;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    #status-bar .brand {
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 600;
      padding-right: 12px;
      border-right: 1px solid rgba(255,255,255,0.2);
    }
    #status-bar .brand-icon {
      width: 16px;
      height: 16px;
      border-radius: 3px;
      flex-shrink: 0;
    }
    #status-bar .hints {
      flex-grow: 1;
      opacity: 0.8;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-family: var(--vscode-editor-font-family, 'Courier New', monospace);
      font-size: 11px;
    }
    #status-bar .filter-indicator {
      color: #cca700;
      padding: 0 8px;
      border-left: 1px solid rgba(255,255,255,0.2);
      border-right: 1px solid rgba(255,255,255,0.2);
    }
    #status-bar .connection {
      display: flex;
      align-items: center;
      gap: 4px;
      padding-left: 8px;
      border-left: 1px solid rgba(255,255,255,0.2);
    }
    #status-bar .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
    #status-bar .dot.connected { background: #3fb950; animation: pulse 2s ease-in-out infinite; }
    #status-bar .dot.disconnected { background: #f85149; }

    /* ─── KV grid ──────────────────────────────────────────────── */
    .kv-grid {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 2px 12px;
      align-items: baseline;
    }
    .kv-key {
      color: var(--vscode-editorInfo-foreground, #2B4C7E);
      white-space: nowrap;
    }
    .kv-value {
      word-break: break-all;
    }

    /* ─── Env grid ─────────────────────────────────────────────── */
    .env-grid {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 1px 12px;
      align-items: baseline;
    }
    .env-grid-key {
      color: var(--vscode-editorInfo-foreground, #2B4C7E);
      white-space: nowrap;
      font-weight: 500;
    }
    .env-grid-value {
      word-break: break-all;
    }

    /* ─── Empty states ────────────────────────────────────────── */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      gap: 6px;
      color: var(--vscode-descriptionForeground);
    }
    .empty-state-side {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 24px 12px;
      gap: 4px;
      color: var(--vscode-descriptionForeground);
    }
    .empty-icon { font-size: 28px; margin-bottom: 4px; }
    .empty-title { font-size: 13px; }
    .empty-subtitle { font-size: 11px; opacity: 0.7; }

    /* ─── Confirm overlay ──────────────────────────────────────── */
    #confirm-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.5);
      backdrop-filter: blur(2px);
      z-index: 100;
      display: flex;
      justify-content: center;
      align-items: center;
      visibility: hidden;
      opacity: 0;
      transition: opacity 0.15s ease, visibility 0.15s ease;
    }
    #confirm-overlay.visible { visibility: visible; opacity: 1; }
    #confirm-overlay .dialog {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      padding: 20px 28px;
      max-width: 400px;
      text-align: center;
      transform: scale(0.95);
      transition: transform 0.15s ease;
    }
    #confirm-overlay.visible .dialog { transform: scale(1); }
    #confirm-overlay .dialog .message { margin-bottom: 16px; font-size: 14px; }
    #confirm-overlay .dialog .buttons { display: flex; gap: 10px; justify-content: center; }
    #confirm-overlay .dialog button {
      padding: 6px 18px;
      border: none;
      border-radius: 3px;
      cursor: pointer;
      font-size: 12px;
      font-family: inherit;
    }
    #confirm-overlay .dialog .btn-confirm {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    #confirm-overlay .dialog .btn-confirm:hover { background: var(--vscode-button-hoverBackground); }
    #confirm-overlay .dialog .btn-cancel {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    /* ─── Filter overlay ───────────────────────────────────────── */
    #filter-overlay {
      display: none;
      position: fixed;
      top: var(--tab-height);
      left: 0;
      right: 0;
      background: var(--vscode-editor-background);
      border-bottom: 1px solid var(--vscode-focusBorder);
      padding: 6px 14px;
      z-index: 90;
    }
    #filter-overlay.visible { display: flex; align-items: center; gap: 8px; }
    #filter-overlay .label { color: var(--vscode-descriptionForeground); font-size: 12px; }
    #filter-overlay input {
      flex-grow: 1;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, transparent);
      padding: 3px 8px;
      font-family: inherit;
      font-size: 12px;
      outline: none;
    }
    #filter-overlay input:focus { border-color: var(--vscode-focusBorder); }

    /* ─── Toast ────────────────────────────────────────────────── */
    #toast-container {
      position: fixed;
      bottom: calc(var(--status-height) + 10px);
      right: 14px;
      z-index: 110;
      display: flex;
      flex-direction: column;
      gap: 6px;
      pointer-events: none;
    }
    @keyframes toastIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes toastOut {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(100%); opacity: 0; }
    }
    .toast {
      padding: 8px 14px;
      border-radius: 4px;
      font-size: 12px;
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      max-width: 350px;
      word-break: break-word;
      animation: toastIn 0.2s ease-out;
    }
    .toast.dismissing {
      animation: toastOut 0.2s ease-in forwards;
    }
    .toast.info { border-left: 3px solid var(--vscode-editorInfo-foreground, #3794ff); }
    .toast.warning { border-left: 3px solid var(--vscode-editorWarning-foreground, #cca700); }
    .toast.error { border-left: 3px solid var(--vscode-errorForeground, #f85149); }

    /* ─── Context menu ─────────────────────────────────────────── */
    #context-menu {
      position: fixed;
      z-index: 95;
      background: var(--vscode-menu-background, var(--vscode-editor-background));
      border: 1px solid var(--vscode-menu-border, var(--vscode-panel-border));
      border-radius: 4px;
      padding: 4px 0;
      min-width: 160px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      visibility: hidden;
      opacity: 0;
      transform: scale(0.95);
      transition: opacity 0.12s ease, visibility 0.12s ease, transform 0.12s ease;
    }
    #context-menu.visible { visibility: visible; opacity: 1; transform: scale(1); }
    #context-menu .menu-item {
      padding: 4px 16px;
      cursor: pointer;
      font-size: 12px;
      display: flex;
      justify-content: space-between;
      user-select: none;
    }
    #context-menu .menu-item:hover,
    #context-menu .menu-item.selected {
      background: var(--vscode-menu-selectionBackground, var(--vscode-list-activeSelectionBackground));
      color: var(--vscode-menu-selectionForeground, var(--vscode-list-activeSelectionForeground));
    }
    #context-menu .menu-item .key {
      color: var(--vscode-descriptionForeground);
      margin-left: 16px;
      font-size: 11px;
    }

    /* ─── Success toast ─────────────────────────────────────────── */
    .toast.success { border-left: 3px solid var(--vscode-testing-iconPassed, #3fb950); }

    /* ─── Focus indicators ──────────────────────────────────────── */
    #side-list.focused {
      border-right-color: var(--vscode-focusBorder, #2B4C7E);
    }
    #detail-pane.focused {
      box-shadow: inset 0 0 0 1px var(--vscode-focusBorder, #2B4C7E);
    }

    /* ─── Layout modes ──────────────────────────────────────────── */
    #main-area { display: flex; flex-grow: 1; overflow: hidden; }
    #main-area.layout-normal #side-list { width: 250px; min-width: 250px; }
    #main-area.layout-wide #side-list { width: 340px; min-width: 340px; }
    #main-area.layout-expanded #side-list { display: none; }

    /* ─── Overlay panels (sort, help, version) ──────────────────── */
    .overlay-panel {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.5);
      backdrop-filter: blur(2px);
      z-index: 96;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      visibility: hidden;
      opacity: 0;
      transition: opacity 0.15s ease, visibility 0.15s ease;
    }
    .overlay-panel.visible { visibility: visible; opacity: 1; }
    .overlay-panel .overlay-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--vscode-foreground);
      margin-bottom: 8px;
    }
    .overlay-panel .overlay-section {
      font-size: 12px;
      font-weight: 600;
      color: var(--vscode-editorWarning-foreground, #cca700);
      margin-top: 12px;
      margin-bottom: 4px;
      border-bottom: 1px solid var(--vscode-panel-border);
      padding-bottom: 2px;
    }
    .overlay-panel .overlay-hint {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      margin-top: 12px;
    }

    /* ─── Sort overlay items ────────────────────────────────────── */
    .sort-item {
      padding: 3px 20px;
      font-size: 12px;
      cursor: pointer;
      border-radius: 3px;
    }
    .sort-item.selected {
      background: var(--vscode-list-activeSelectionBackground);
      color: var(--vscode-list-activeSelectionForeground);
    }
    .sort-item.current {
      color: var(--vscode-editorWarning-foreground, #cca700);
    }

    /* ─── Help overlay ──────────────────────────────────────────── */
    .help-row {
      display: flex;
      gap: 12px;
      padding: 2px 0;
      font-size: 12px;
    }
    .help-key {
      background: var(--vscode-badge-background, #2B4C7E);
      color: var(--vscode-badge-foreground, #fff);
      padding: 1px 6px;
      border-radius: 3px;
      font-size: 11px;
      min-width: 40px;
      text-align: center;
      font-family: var(--vscode-editor-font-family, monospace);
    }
    .help-key.destructive {
      background: var(--vscode-errorForeground, #f85149);
    }
    .help-label {
      color: var(--vscode-descriptionForeground);
    }
    .help-label.destructive {
      color: var(--vscode-errorForeground, #f85149);
    }

    /* ─── Version overlay ───────────────────────────────────────── */
    .version-tagline {
      font-size: 13px;
      color: var(--vscode-editorInfo-foreground, #2B4C7E);
      font-weight: 600;
    }
    .version-divider {
      width: 200px;
      height: 1px;
      background: var(--vscode-panel-border);
      margin: 8px 0;
    }
    .version-phrase {
      font-style: italic;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }

    /* ─── Scroll indicators ─────────────────────────────────────── */
    #scroll-indicators {
      position: absolute;
      right: 20px;
      top: calc(var(--tab-height) + var(--detail-tab-height) + 4px);
      z-index: 50;
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      pointer-events: none;
      display: flex;
      gap: 8px;
    }
    .scroll-up, .scroll-down {
      background: var(--vscode-editor-background);
      padding: 1px 4px;
      border-radius: 3px;
      border: 1px solid var(--vscode-panel-border);
      opacity: 0.8;
    }

    /* ─── Status bar indicators ─────────────────────────────────── */
    #status-bar .status-indicator {
      font-size: 10px;
      padding: 1px 6px;
      border-radius: 3px;
      background: rgba(255,255,255,0.1);
      text-transform: capitalize;
    }

    /* ─── Sparkline labels ──────────────────────────────────────── */
    .sparkline-label {
      font-size: 9px;
      color: var(--vscode-descriptionForeground);
      opacity: 0.7;
      margin: 0 2px;
    }

    /* ─── Rate sparkline rows ───────────────────────────────────── */
    .sparkline-row.net-rx .sparkline { color: var(--vscode-testing-iconPassed, #3fb950); }
    .sparkline-row.net-tx .sparkline { color: var(--vscode-editorInfo-foreground, #2B4C7E); }
    .sparkline-row.block-read .sparkline { color: var(--vscode-editorWarning-foreground, #cca700); }
    .sparkline-row.block-write .sparkline { color: var(--vscode-descriptionForeground); }
    .sparkline-row.severity { margin-top: 4px; }

    /* ─── Filesystem changes ─────────────────────────────────────── */
    .change-added { color: var(--vscode-testing-iconPassed, #3fb950); }
    .change-changed { color: var(--vscode-editorWarning-foreground, #cca700); }
    .change-deleted { color: var(--vscode-errorForeground, #f85149); }
    .change-row { display: flex; gap: 8px; padding: 1px 4px; font-size: 12px; }
    .change-row:hover { background: var(--vscode-list-hoverBackground); }
    .change-kind { min-width: 16px; font-weight: 600; }
    .change-path { flex: 1; word-break: break-all; }

    /* ─── Image layers ───────────────────────────────────────────── */
    .layer-row { display: flex; gap: 8px; padding: 2px 4px; font-size: 12px; }
    .layer-row:hover { background: var(--vscode-list-hoverBackground); }
    .layer-num { min-width: 24px; text-align: right; color: var(--vscode-descriptionForeground); }
    .layer-size { min-width: 70px; text-align: right; font-variant-numeric: tabular-nums; }
    .layer-size.zero { color: var(--vscode-descriptionForeground); opacity: 0.5; }
    .layer-cmd { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .layer-summary { padding: 8px 4px; font-size: 12px; color: var(--vscode-descriptionForeground); }
  </style>
</head>
<body>
  <div id="tab-bar"></div>
  <div id="main-area">
    <div id="side-list"></div>
    <div id="detail-pane">
      <div id="detail-tab-bar"></div>
      <div id="detail-content"></div>
    </div>
  </div>
  <div id="status-bar">
    <span class="brand"><img src="${iconUri}" alt="" class="brand-icon" />SIDEKICK Docker</span>
    <span class="hints"></span>
    <span class="connection"><span class="dot disconnected"></span><span class="conn-text">connecting...</span></span>
  </div>

  <div id="confirm-overlay">
    <div class="dialog">
      <div class="message"></div>
      <div class="buttons">
        <button class="btn-confirm">Confirm (y)</button>
        <button class="btn-cancel">Cancel (n)</button>
      </div>
    </div>
  </div>
  <div id="filter-overlay">
    <span class="label">Filter:</span>
    <input type="text" id="filter-input" placeholder="Type to filter..." />
  </div>
  <div id="context-menu"></div>
  <div id="sort-overlay" class="overlay-panel"></div>
  <div id="help-overlay" class="overlay-panel"></div>
  <div id="version-overlay" class="overlay-panel"></div>
  <div id="scroll-indicators"></div>
  <div id="toast-container"></div>

  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private _cleanup(): void {
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
    this.panel?.dispose();
    this.panel = undefined;
  }
}
