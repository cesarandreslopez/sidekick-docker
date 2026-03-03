declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

import type { ExtensionMessage, WebviewMessage } from '../types/messages';
import type { PanelDefinition, PanelItem, ActionDefinition } from './panels/types';
import type { WebviewState } from './state';
import { createInitialState } from './state';
import { containersPanel } from './panels/containers';
import { servicesPanel } from './panels/services';
import { imagesPanel } from './panels/images';
import { volumesPanel } from './panels/volumes';
import { networksPanel } from './panels/networks';
import { LogAnalytics } from '../log/LogAnalytics';

const vscode = acquireVsCodeApi();
const TOAST_DURATIONS = { error: 4000, warning: 3000, info: 2000 } as const;

const panels: PanelDefinition[] = [
  containersPanel,
  servicesPanel,
  imagesPanel,
  volumesPanel,
  networksPanel,
];

let state: WebviewState = createInitialState();
let toastIdCounter = 0;

// ─── Local phrase rotation ──────────────────────────────────────────
let phraseBank: string[] = [];
let phraseIndex = 0;
let phraseFallbackTimer: ReturnType<typeof setTimeout> | undefined;

function rotatePhrase(): void {
  if (phraseBank.length === 0) return;
  state.phrase = phraseBank[phraseIndex % phraseBank.length];
  phraseIndex++;
  // Update phrase text without rebuilding tab bar (which would destroy click handlers)
  const phraseEl = $tabBar.querySelector('.phrase');
  if (phraseEl) phraseEl.textContent = state.phrase;
  // Reset 7s fallback timer
  if (phraseFallbackTimer !== undefined) clearTimeout(phraseFallbackTimer);
  phraseFallbackTimer = setTimeout(rotatePhrase, 7000);
}

// ─── DOM refs ────────────────────────────────────────────────────────
const $tabBar = document.getElementById('tab-bar')!;
const $sideList = document.getElementById('side-list')!;
const $detailTabBar = document.getElementById('detail-tab-bar')!;
const $detailContent = document.getElementById('detail-content')!;
const $statusBar = document.getElementById('status-bar')!;
const $confirmOverlay = document.getElementById('confirm-overlay')!;
const $confirmMessage = $confirmOverlay.querySelector('.message')!;
const $confirmYes = $confirmOverlay.querySelector('.btn-confirm') as HTMLButtonElement;
const $confirmNo = $confirmOverlay.querySelector('.btn-cancel') as HTMLButtonElement;
const $filterOverlay = document.getElementById('filter-overlay')!;
const $filterInput = document.getElementById('filter-input') as HTMLInputElement;
const $contextMenu = document.getElementById('context-menu')!;
const $toastContainer = document.getElementById('toast-container')!;

// ─── Helpers ─────────────────────────────────────────────────────────
function post(msg: WebviewMessage): void { vscode.postMessage(msg); }

function getPanel(): PanelDefinition { return panels[state.activePanelIndex]; }

function getFilteredItems(): PanelItem[] {
  if (!state.snapshot) return [];
  let items = getPanel().getItems(state.snapshot);
  if (state.filterString) {
    const f = state.filterString.toLowerCase();
    items = items.filter(it => {
      const text = getPanel().getSearchableText(it, state.snapshot!);
      return text.toLowerCase().includes(f);
    });
  }
  items.sort((a, b) => a.sortKey - b.sortKey);
  return items;
}

function getSelectedItem(items: PanelItem[]): PanelItem | undefined {
  return items.find(it => it.id === state.selectedItemId) ?? items[0];
}

function getSelectedIndex(items: PanelItem[]): number {
  const idx = items.findIndex(it => it.id === state.selectedItemId);
  return idx >= 0 ? idx : 0;
}

function addToast(message: string, severity: 'error' | 'warning' | 'info'): void {
  const id = ++toastIdCounter;
  const timer = window.setTimeout(() => {
    // Start dismiss animation
    const el = $toastContainer.querySelector(`[data-toast-id="${id}"]`);
    if (el) {
      el.classList.add('dismissing');
      window.setTimeout(() => {
        state.toasts = state.toasts.filter(t => t.id !== id);
        renderToasts();
      }, 200);
    } else {
      state.toasts = state.toasts.filter(t => t.id !== id);
      renderToasts();
    }
  }, TOAST_DURATIONS[severity]);
  state.toasts.push({ id, message, severity, timer });
  renderToasts();
}

function showConfirm(message: string, callback: () => void): void {
  state.confirmVisible = true;
  state.confirmMessage = message;
  state.confirmCallback = callback;
  $confirmMessage.textContent = message;
  $confirmOverlay.classList.add('visible');
}

function hideConfirm(): void {
  state.confirmVisible = false;
  state.confirmCallback = null;
  $confirmOverlay.classList.remove('visible');
}

function showFilter(): void {
  state.filterVisible = true;
  $filterOverlay.classList.add('visible');
  $filterInput.value = state.filterString;
  $filterInput.focus();
}

function hideFilter(): void {
  state.filterVisible = false;
  $filterOverlay.classList.remove('visible');
}

function showContextMenu(items: PanelItem[]): void {
  const item = getSelectedItem(items);
  if (!item || !state.snapshot) return;
  const actions = getPanel().getActions(item, state.snapshot);
  if (actions.length === 0) return;

  state.contextMenuVisible = true;
  state.contextMenuIndex = 0;
  renderContextMenu(actions);
  $contextMenu.classList.add('visible');

  // Position near center
  $contextMenu.style.top = '50%';
  $contextMenu.style.left = '50%';
  $contextMenu.style.transform = 'translate(-50%, -50%)';
}

function hideContextMenu(): void {
  state.contextMenuVisible = false;
  $contextMenu.classList.remove('visible');
}

// ─── Empty state helpers ──────────────────────────────────────────────
function renderEmptyState(emoji: string, title: string, subtitle: string): string {
  return `<div class="empty-state"><div class="empty-icon">${emoji}</div><div class="empty-title">${escapeHtml(title)}</div><div class="empty-subtitle">${escapeHtml(subtitle)}</div></div>`;
}

function renderEmptyStateSide(panelId: string): string {
  const emptyStates: Record<string, { emoji: string; title: string; subtitle: string }> = {
    containers: { emoji: '\u{1F4E6}', title: 'No containers', subtitle: 'Run a container to get started' },
    services: { emoji: '\u{1F9E9}', title: 'No compose projects', subtitle: 'Start a project with docker compose up' },
    images: { emoji: '\u{1F5BC}\uFE0F', title: 'No images', subtitle: 'Pull an image to get started' },
    volumes: { emoji: '\u{1F4BE}', title: 'No volumes', subtitle: 'Volumes will appear when created' },
    networks: { emoji: '\u{1F310}', title: 'No networks', subtitle: 'Networks will appear when created' },
  };
  const s = emptyStates[panelId] ?? { emoji: '\u{1F4AD}', title: 'Nothing here', subtitle: '' };
  return `<div class="empty-state-side"><div class="empty-icon">${s.emoji}</div><div class="empty-title">${escapeHtml(s.title)}</div><div class="empty-subtitle">${escapeHtml(s.subtitle)}</div></div>`;
}

// ─── Rendering ───────────────────────────────────────────────────────
function renderAll(): void {
  renderTabBar();
  const items = getFilteredItems();
  renderSideList(items);
  renderDetailTabBar();
  renderDetailContent(items);
  renderStatusBar(items);
}

function renderTabBar(): void {
  let html = '';
  for (let i = 0; i < panels.length; i++) {
    const p = panels[i];
    const active = i === state.activePanelIndex ? ' active' : '';
    html += `<div class="tab${active}" data-panel="${i}"><span class="shortcut">${p.shortcutKey}</span>${p.title}</div>`;
  }
  html += `<div class="phrase">${escapeHtml(state.phrase)}</div>`;
  $tabBar.innerHTML = html;

  // Tab click handlers
  $tabBar.querySelectorAll('.tab').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt((el as HTMLElement).dataset.panel!, 10);
      switchPanel(idx);
    });
  });
}

function renderSideList(items: PanelItem[]): void {
  if (items.length === 0) {
    $sideList.innerHTML = renderEmptyStateSide(getPanel().id);
    return;
  }

  let html = '';
  let lastGroup: string | undefined;
  for (const item of items) {
    if (item.group !== undefined && item.group !== lastGroup) {
      html += `<div class="side-group-header">${escapeHtml(item.group)}</div>`;
      lastGroup = item.group;
    }
    const selected = item.id === state.selectedItemId ? ' selected' : '';
    const iconHtml = item.icon ? `<span style="color:${item.iconColor};margin-right:4px;flex-shrink:0;">${item.icon}</span>` : '';
    const badgeHtml = item.badge ? `<span class="side-badge">${escapeHtml(item.badge)}</span>` : '';
    html += `<div class="side-item${selected}" data-id="${escapeAttr(item.id)}">${iconHtml}<span class="side-label">${escapeHtml(item.label)}</span>${badgeHtml}</div>`;
  }
  $sideList.innerHTML = html;

  // Click handlers
  $sideList.querySelectorAll('.side-item').forEach(el => {
    el.addEventListener('click', () => {
      const id = (el as HTMLElement).dataset.id;
      if (id !== undefined) selectItem(id, getFilteredItems());
    });
  });

  // Scroll selected into view
  const selectedEl = $sideList.querySelector('.side-item.selected');
  selectedEl?.scrollIntoView({ block: 'nearest' });
}

function renderDetailTabBar(): void {
  const panel = getPanel();
  let html = '';
  for (let i = 0; i < panel.detailTabs.length; i++) {
    const t = panel.detailTabs[i];
    const active = i === state.detailTabIndex ? ' active' : '';
    html += `<div class="detail-tab${active}" data-tab="${i}">${t.label}</div>`;
  }
  $detailTabBar.innerHTML = html;

  $detailTabBar.querySelectorAll('.detail-tab').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt((el as HTMLElement).dataset.tab!, 10);
      state.detailTabIndex = idx;
      renderDetailTabBar();
      renderDetailContent(getFilteredItems());
    });
  });
}

function renderDetailContent(items: PanelItem[]): void {
  const panel = getPanel();
  const item = getSelectedItem(items);
  const tab = panel.detailTabs[state.detailTabIndex];

  if (!item || !tab) {
    $detailContent.innerHTML = renderEmptyState('\u{1F449}', 'No item selected', 'Select an item from the list');
    return;
  }

  const html = tab.render(item, state);
  $detailContent.innerHTML = html;

  // Trigger fade-in animation
  $detailContent.classList.remove('fade-in');
  void $detailContent.offsetWidth; // force reflow
  $detailContent.classList.add('fade-in');

  // Auto-scroll to bottom for log tabs
  if (tab.autoScrollBottom) {
    $detailContent.scrollTop = $detailContent.scrollHeight;
  }
}

function renderStatusBar(items: PanelItem[]): void {
  const snapshot = state.snapshot;
  const connected = snapshot?.daemonConnected ?? false;
  const runningCount = snapshot?.containers.filter(c => c.state === 'running').length ?? 0;
  const totalCount = snapshot?.containers.length ?? 0;

  const item = getSelectedItem(items);
  let hints = '';
  if (item && snapshot) {
    const actions = getPanel().getActions(item, snapshot);
    hints = actions.map(a => `${a.key}:${a.label}`).join('  ');
  }

  const connDot = connected ? '<span class="dot connected"></span>' : '<span class="dot disconnected"></span>';
  const connText = connected ? `${runningCount}/${totalCount}` : 'disconnected';

  let filterHtml = '';
  if (state.filterString) {
    const allItems = snapshot ? getPanel().getItems(snapshot) : [];
    filterHtml = `<span class="filter-indicator">Filter: "${escapeHtml(state.filterString)}" (${items.length} of ${allItems.length})</span>`;
  }

  $statusBar.innerHTML = `
    <span class="brand">\u26A1 SIDEKICK Docker v0.1.0</span>
    <span class="hints">${escapeHtml(hints)}${hints ? '  ' : ''}/ filter  x actions  1-5 panels</span>
    ${filterHtml}
    <span class="connection">${connDot}<span class="conn-text">${connText}</span></span>
  `;
}

function renderContextMenu(actions: ActionDefinition[]): void {
  let html = '';
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i];
    const selected = i === state.contextMenuIndex ? ' selected' : '';
    html += `<div class="menu-item${selected}" data-idx="${i}" data-action="${a.actionType}">${a.label}<span class="key">${a.key}</span></div>`;
  }
  $contextMenu.innerHTML = html;

  $contextMenu.querySelectorAll('.menu-item').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt((el as HTMLElement).dataset.idx!, 10);
      executeContextAction(idx, actions);
    });
  });
}

function renderToasts(): void {
  $toastContainer.innerHTML = state.toasts.map(t =>
    `<div class="toast ${t.severity}" data-toast-id="${t.id}">${escapeHtml(t.message)}</div>`
  ).join('');
}

// ─── Actions ─────────────────────────────────────────────────────────
function switchPanel(idx: number): void {
  if (idx < 0 || idx >= panels.length || idx === state.activePanelIndex) return;
  state.activePanelIndex = idx;
  state.selectedItemId = null;
  state.detailTabIndex = 0;
  state.filterString = '';
  hideFilter();
  hideContextMenu();
  post({ type: 'switchPanel', panelIndex: idx });
  // Deselect container streams when switching away from containers
  post({ type: 'selectItem', panelId: panels[idx].id, itemId: null });
  renderAll();
}

function selectItem(id: string, items: PanelItem[]): void {
  if (id === state.selectedItemId) return;
  state.selectedItemId = id;
  state.detailTabIndex = 0;
  post({ type: 'selectItem', panelId: getPanel().id, itemId: id });

  // Notify extension about compose service selection for log streaming
  if (getPanel().id === 'services') {
    const parts = id.split(':');
    if (parts[0] === 'project') {
      post({ type: 'selectComposeService', projectName: parts.slice(1).join(':'), serviceName: null });
    } else if (parts[0] === 'service') {
      post({ type: 'selectComposeService', projectName: parts[1], serviceName: parts.slice(2).join(':') });
    }
  }

  renderSideList(items);
  renderDetailTabBar();
  renderDetailContent(items);
  renderStatusBar(items);
}

function navigateSide(delta: number): void {
  const items = getFilteredItems();
  if (items.length === 0) return;
  const idx = getSelectedIndex(items);
  const newIdx = Math.max(0, Math.min(items.length - 1, idx + delta));
  if (items[newIdx].id !== state.selectedItemId) {
    selectItem(items[newIdx].id, items);
  }
}

function executeAction(action: ActionDefinition, itemId: string): void {
  if (action.actionType === 'exec') {
    post({ type: 'execContainer', containerId: itemId });
    return;
  }
  if (action.confirm) {
    showConfirm(action.confirmMessage || 'Are you sure?', () => {
      post({ type: 'action', actionType: action.actionType, itemId, panelId: getPanel().id });
    });
  } else {
    post({ type: 'action', actionType: action.actionType, itemId, panelId: getPanel().id });
  }
}

function executeContextAction(idx: number, actions: ActionDefinition[]): void {
  const action = actions[idx];
  const items = getFilteredItems();
  const item = getSelectedItem(items);
  if (!action || !item) return;
  hideContextMenu();
  executeAction(action, item.id);
}

// ─── Keyboard handling ───────────────────────────────────────────────
document.addEventListener('keydown', (e: KeyboardEvent) => {
  rotatePhrase();

  // Confirm overlay
  if (state.confirmVisible) {
    if (e.key === 'y' || e.key === 'Y' || e.key === 'Enter') {
      e.preventDefault();
      state.confirmCallback?.();
      hideConfirm();
      return;
    }
    if (e.key === 'n' || e.key === 'N' || e.key === 'Escape') {
      e.preventDefault();
      hideConfirm();
      return;
    }
    return;
  }

  // Filter overlay
  if (state.filterVisible) {
    if (e.key === 'Escape') {
      e.preventDefault();
      state.filterString = '';
      hideFilter();
      renderAll();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      hideFilter();
      return;
    }
    // Let the input handle typing
    return;
  }

  // Context menu
  if (state.contextMenuVisible) {
    if (e.key === 'Escape') {
      e.preventDefault();
      hideContextMenu();
      return;
    }
    if (e.key === 'j' || e.key === 'ArrowDown') {
      e.preventDefault();
      const items = getFilteredItems();
      const item = getSelectedItem(items);
      if (!item || !state.snapshot) return;
      const actions = getPanel().getActions(item, state.snapshot);
      state.contextMenuIndex = (state.contextMenuIndex + 1) % actions.length;
      renderContextMenu(actions);
      return;
    }
    if (e.key === 'k' || e.key === 'ArrowUp') {
      e.preventDefault();
      const items = getFilteredItems();
      const item = getSelectedItem(items);
      if (!item || !state.snapshot) return;
      const actions = getPanel().getActions(item, state.snapshot);
      state.contextMenuIndex = (state.contextMenuIndex - 1 + actions.length) % actions.length;
      renderContextMenu(actions);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const items = getFilteredItems();
      const item = getSelectedItem(items);
      if (!item || !state.snapshot) return;
      const actions = getPanel().getActions(item, state.snapshot);
      executeContextAction(state.contextMenuIndex, actions);
      return;
    }
    // Check for action key shortcut
    const items = getFilteredItems();
    const item = getSelectedItem(items);
    if (item && state.snapshot) {
      const actions = getPanel().getActions(item, state.snapshot);
      const match = actions.find(a => a.key === e.key);
      if (match) {
        e.preventDefault();
        hideContextMenu();
        executeAction(match, item.id);
        return;
      }
    }
    return;
  }

  // ── Global keys ────────────────────────────────────────────────
  // Panel switching: 1-5
  const num = parseInt(e.key, 10);
  if (num >= 1 && num <= panels.length) {
    e.preventDefault();
    switchPanel(num - 1);
    return;
  }

  // Navigation
  if (e.key === 'j' || e.key === 'ArrowDown') {
    e.preventDefault();
    navigateSide(1);
    return;
  }
  if (e.key === 'k' || e.key === 'ArrowUp') {
    e.preventDefault();
    navigateSide(-1);
    return;
  }
  if (e.key === 'g') {
    e.preventDefault();
    navigateSide(-Infinity);
    return;
  }
  if (e.key === 'G') {
    e.preventDefault();
    navigateSide(Infinity);
    return;
  }

  // Detail tab cycling
  if (e.key === '[') {
    e.preventDefault();
    const tabCount = getPanel().detailTabs.length;
    if (tabCount > 1) {
      state.detailTabIndex = (state.detailTabIndex - 1 + tabCount) % tabCount;
      renderDetailTabBar();
      renderDetailContent(getFilteredItems());
    }
    return;
  }
  if (e.key === ']') {
    e.preventDefault();
    const tabCount = getPanel().detailTabs.length;
    if (tabCount > 1) {
      state.detailTabIndex = (state.detailTabIndex + 1) % tabCount;
      renderDetailTabBar();
      renderDetailContent(getFilteredItems());
    }
    return;
  }

  // Filter
  if (e.key === '/') {
    e.preventDefault();
    showFilter();
    return;
  }

  // Context menu
  if (e.key === 'x') {
    e.preventDefault();
    showContextMenu(getFilteredItems());
    return;
  }

  // Escape: clear filter or close overlay
  if (e.key === 'Escape') {
    e.preventDefault();
    if (state.filterString) {
      state.filterString = '';
      post({ type: 'filterChange', filter: '' });
      renderAll();
    }
    return;
  }

  // Action shortcut keys (when no overlay is active)
  const items = getFilteredItems();
  const selItem = getSelectedItem(items);
  if (selItem && state.snapshot) {
    const actions = getPanel().getActions(selItem, state.snapshot);
    const match = actions.find(a => a.key === e.key);
    if (match) {
      e.preventDefault();
      executeAction(match, selItem.id);
    }
  }
});

// Filter input handler
$filterInput.addEventListener('input', () => {
  state.filterString = $filterInput.value;
  post({ type: 'filterChange', filter: state.filterString });
  const items = getFilteredItems();
  renderSideList(items);
  renderStatusBar(items);
});

// Log filter input handler (event delegation on detail content)
$detailContent.addEventListener('input', (e: Event) => {
  const target = e.target as HTMLInputElement;
  if (target.id === 'log-filter-input') {
    state.logFilterString = target.value;
    renderDetailContent(getFilteredItems());
  }
});

$detailContent.addEventListener('click', (e: Event) => {
  const target = e.target as HTMLElement;
  if (target.id === 'log-filter-mode') {
    state.logFilterMode = state.logFilterMode === 'exact' ? 'fuzzy' : 'exact';
    renderDetailContent(getFilteredItems());
  }
});

// Confirm overlay buttons
$confirmYes.addEventListener('click', () => {
  state.confirmCallback?.();
  hideConfirm();
});
$confirmNo.addEventListener('click', () => hideConfirm());

// Rotate phrase on mouse interaction
document.addEventListener('mousedown', () => rotatePhrase());

// ─── Message handling ────────────────────────────────────────────────
window.addEventListener('message', (event: MessageEvent<ExtensionMessage>) => {
  const msg = event.data;

  switch (msg.type) {
    case 'updateState': {
      state.snapshot = msg.snapshot;
      // Auto-select first item if nothing selected
      const items = getFilteredItems();
      if (!state.selectedItemId && items.length > 0) {
        state.selectedItemId = items[0].id;
        post({ type: 'selectItem', panelId: getPanel().id, itemId: items[0].id });
      }
      renderAll();
      break;
    }

    case 'updateLogs': {
      state.logs.set(msg.containerId, msg.entries);
      // Recompute severity counts
      const analytics = new LogAnalytics();
      for (const e of msg.entries) {
        analytics.push(e.message);
      }
      state.logSeverityCounts.set(msg.containerId, analytics.getCounts());
      // Only re-render if we're viewing this container's logs
      if (state.selectedItemId === msg.containerId && getPanel().id === 'containers' && state.detailTabIndex === 0) {
        renderDetailContent(getFilteredItems());
      }
      break;
    }

    case 'updateStats': {
      state.stats.set(msg.containerId, { stats: msg.stats, loading: msg.loading, cpuHistory: msg.cpuHistory, memoryHistory: msg.memoryHistory });
      if (state.selectedItemId === msg.containerId && getPanel().id === 'containers' && state.detailTabIndex === 1) {
        renderDetailContent(getFilteredItems());
      }
      break;
    }

    case 'updateEnv': {
      state.envVars.set(msg.containerId, msg.env);
      if (state.selectedItemId === msg.containerId && getPanel().id === 'containers' && state.detailTabIndex === 2) {
        renderDetailContent(getFilteredItems());
      }
      break;
    }

    case 'phraseBank': {
      phraseBank = msg.phrases;
      phraseIndex = 0;
      rotatePhrase();
      break;
    }

    case 'toast': {
      addToast(msg.message, msg.severity);
      break;
    }

    case 'focusContainer': {
      // Switch to containers panel and select the specified container
      if (state.activePanelIndex !== 0) {
        state.activePanelIndex = 0;
        state.filterString = '';
        hideFilter();
        hideContextMenu();
        post({ type: 'switchPanel', panelIndex: 0 });
      }
      state.selectedItemId = msg.containerId;
      state.detailTabIndex = 0;
      post({ type: 'selectItem', panelId: 'containers', itemId: msg.containerId });
      renderAll();
      break;
    }

    case 'updateComposeLogs': {
      const key = msg.serviceName ? `${msg.projectName}:${msg.serviceName}` : msg.projectName;
      state.composeLogs.set(key, msg.entries);
      // Re-render if viewing this service's logs
      if (getPanel().id === 'services' && state.detailTabIndex === 1) {
        const items = getFilteredItems();
        const item = getSelectedItem(items);
        if (item) {
          const parts = item.id.split(':');
          let itemKey = '';
          if (parts[0] === 'project') {
            itemKey = parts.slice(1).join(':');
          } else if (parts[0] === 'service') {
            itemKey = `${parts[1]}:${parts.slice(2).join(':')}`;
          }
          if (itemKey === key) {
            renderDetailContent(items);
          }
        }
      }
      break;
    }
  }
});

// ─── Escape HTML helpers ─────────────────────────────────────────────
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── Initialize ──────────────────────────────────────────────────────
function initialize(): void {
  renderAll();
  post({ type: 'webviewReady' });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
