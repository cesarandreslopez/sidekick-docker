declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};
declare const __VERSION__: string;

import type { ExtensionMessage, WebviewMessage, SerializedLogEntry } from '../types/messages';
import type { PanelDefinition, PanelItem, ActionDefinition } from './panels/types';
import type { WebviewState, SortField, ToastSeverity, PersistedViewState } from './state';
import { createInitialState, SORT_OPTIONS } from './state';
import { containersPanel } from './panels/containers';
import { servicesPanel } from './panels/services';
import { imagesPanel } from './panels/images';
import { volumesPanel } from './panels/volumes';
import { networksPanel } from './panels/networks';
import { colorizeLogEntry, escapeHtml, escapeAttr } from './formatters';
import {
  initOverlays,
  showConfirm,
  hideConfirm,
  showFilter,
  hideFilter,
  showContextMenu,
  hideContextMenu,
  renderContextMenu,
  renderSortOverlay,
  renderHelpOverlay,
  renderVersionOverlay,
} from './overlays';
import { handleGlobalKeydown } from './keyboard';
import type { KeyboardContext } from './keyboard';
import { filterLine } from 'sidekick-docker-shared/log';

const vscode = acquireVsCodeApi();
const TOAST_DURATIONS: Record<ToastSeverity, number> = { error: 4000, warning: 3000, info: 2000, success: 2000 };

const panels: PanelDefinition[] = [
  containersPanel,
  servicesPanel,
  imagesPanel,
  volumesPanel,
  networksPanel,
];

// ─── Persisted view state (survives tab hide + window reload) ────────
function readPersistedState(): Partial<PersistedViewState> | undefined {
  const raw = vscode.getState();
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const out: Partial<PersistedViewState> = {};
  if (typeof r.activePanelIndex === 'number' && r.activePanelIndex >= 0 && r.activePanelIndex < panels.length) {
    out.activePanelIndex = r.activePanelIndex;
  }
  if (typeof r.selectedItemId === 'string') out.selectedItemId = r.selectedItemId;
  const restoredPanel = panels[out.activePanelIndex ?? 0];
  if (typeof r.detailTabIndex === 'number' && r.detailTabIndex >= 0 && r.detailTabIndex < restoredPanel.detailTabs.length) {
    out.detailTabIndex = r.detailTabIndex;
  }
  if (SORT_OPTIONS.some(o => o.field === r.sortField)) out.sortField = r.sortField as SortField;
  if (typeof r.sortReversed === 'boolean') out.sortReversed = r.sortReversed;
  if (r.layoutMode === 'normal' || r.layoutMode === 'wide' || r.layoutMode === 'expanded') out.layoutMode = r.layoutMode;
  if (typeof r.showAllContainers === 'boolean') out.showAllContainers = r.showAllContainers;
  return out;
}

const restoredViewState = readPersistedState();
const state: WebviewState = createInitialState(restoredViewState);
let toastIdCounter = 0;

function persistViewState(): void {
  const persisted: PersistedViewState = {
    activePanelIndex: state.activePanelIndex,
    selectedItemId: state.selectedItemId,
    detailTabIndex: state.detailTabIndex,
    sortField: state.sortField,
    sortReversed: state.sortReversed,
    layoutMode: state.layoutMode,
    showAllContainers: state.showAllContainers,
  };
  vscode.setState(persisted);
}

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
// Overlay elements (confirm, filter, context menu, sort/help/version) are
// owned by webview/overlays.ts.
const $tabBar = document.getElementById('tab-bar')!;
const $sideList = document.getElementById('side-list')!;
const $detailTabBar = document.getElementById('detail-tab-bar')!;
const $detailContent = document.getElementById('detail-content')!;
const $statusBar = document.getElementById('status-bar')!;
const $toastContainer = document.getElementById('toast-container')!;

// ─── Helpers ─────────────────────────────────────────────────────────
function post(msg: WebviewMessage): void { vscode.postMessage(msg); }

function getPanel(): PanelDefinition { return panels[state.activePanelIndex]; }

function getFilteredItems(): PanelItem[] {
  if (!state.snapshot) return [];
  let items = getPanel().getItems(state.snapshot);

  // Show all/running filter (containers only)
  if (!state.showAllContainers && getPanel().id === 'containers') {
    items = items.filter(it => {
      const c = state.snapshot!.containers.find(cc => cc.id === it.id);
      return c?.state === 'running';
    });
  }

  if (state.filterString) {
    const f = state.filterString.toLowerCase();
    items = items.filter(it => {
      const text = getPanel().getSearchableText(it, state.snapshot!);
      return text.toLowerCase().includes(f);
    });
  }

  // Custom sort for containers panel
  if (getPanel().id === 'containers' && state.sortField !== 'state') {
    items.sort((a, b) => {
      const val = containerSortCompare(a, b, state.sortField);
      return state.sortReversed ? -val : val;
    });
  } else {
    items.sort((a, b) => {
      const val = a.sortKey - b.sortKey || a.label.localeCompare(b.label);
      return state.sortReversed && getPanel().id === 'containers' ? -val : val;
    });
  }
  return items;
}

function containerSortCompare(a: PanelItem, b: PanelItem, field: SortField): number {
  const sa = state.stats.get(a.id);
  const sb = state.stats.get(b.id);
  switch (field) {
    case 'name': return a.label.localeCompare(b.label);
    case 'cpu': return (sb?.stats?.cpuPercent ?? 0) - (sa?.stats?.cpuPercent ?? 0);
    case 'mem': return (sb?.stats?.memoryPercent ?? 0) - (sa?.stats?.memoryPercent ?? 0);
    case 'net': return ((sb?.stats?.networkRx ?? 0) + (sb?.stats?.networkTx ?? 0)) - ((sa?.stats?.networkRx ?? 0) + (sa?.stats?.networkTx ?? 0));
    case 'io': return ((sb?.stats?.blockRead ?? 0) + (sb?.stats?.blockWrite ?? 0)) - ((sa?.stats?.blockRead ?? 0) + (sa?.stats?.blockWrite ?? 0));
    case 'pids': return (sb?.stats?.pids ?? 0) - (sa?.stats?.pids ?? 0);
    default: return a.sortKey - b.sortKey;
  }
}

function getSelectedItem(items: PanelItem[]): PanelItem | undefined {
  return items.find(it => it.id === state.selectedItemId) ?? items[0];
}

function getSelectedIndex(items: PanelItem[]): number {
  const idx = items.findIndex(it => it.id === state.selectedItemId);
  return idx >= 0 ? idx : 0;
}

interface RenderDetailOptions {
  animate?: boolean;
  preserveScroll?: boolean;
  restoreLogFocus?: boolean;
}

function getLogEntryKey(entry: { timestamp: string | null; stream: string; message: string } | undefined): string {
  return entry ? `${entry.timestamp ?? ''}:${entry.stream}:${entry.message}` : '';
}

function isNearBottom(el: HTMLElement, threshold = 24): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
}

function renderSeverityBadgesHtml(counts: { error: number; warn: number; info: number; debug: number; total: number }): string {
  if (counts.total <= 0) return '';
  const badges: string[] = [];
  if (counts.error > 0) badges.push(`<span class="sev-badge error">E:${counts.error}</span>`);
  if (counts.warn > 0) badges.push(`<span class="sev-badge warn">W:${counts.warn}</span>`);
  if (counts.info > 0) badges.push(`<span class="sev-badge info">I:${counts.info}</span>`);
  if (counts.debug > 0) badges.push(`<span class="sev-badge debug">D:${counts.debug}</span>`);
  return badges.join('');
}

function getSelectedComposeLogKey(item: PanelItem | undefined): string | null {
  if (!item) return null;
  const parts = item.id.split(':');
  if (parts[0] === 'project') return parts.slice(1).join(':');
  if (parts[0] === 'service') return `${parts[1]}:${parts.slice(2).join(':')}`;
  return null;
}

function dismissToast(id: number): void {
  const toast = state.toasts.find(t => t.id === id);
  if (toast && toast.timer !== null) window.clearTimeout(toast.timer);
  const finalize = (): void => {
    state.toasts = state.toasts.filter(t => t.id !== id);
    renderToasts();
  };
  // Start dismiss animation
  const el = $toastContainer.querySelector(`[data-toast-id="${id}"]`);
  if (el) {
    el.classList.add('dismissing');
    window.setTimeout(finalize, 200);
  } else {
    finalize();
  }
}

function addToast(message: string, severity: ToastSeverity): void {
  const id = ++toastIdCounter;
  // Errors stay until explicitly dismissed (with a copy affordance).
  const sticky = severity === 'error';
  const timer = sticky ? null : window.setTimeout(() => dismissToast(id), TOAST_DURATIONS[severity]);
  state.toasts.push({ id, message, severity, timer, sticky });
  renderToasts();
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
  // Apply layout mode class
  const mainArea = document.getElementById('main-area')!;
  mainArea.className = `layout-${state.layoutMode}`;

  // Apply focus indicator
  $sideList.classList.toggle('focused', state.focusTarget === 'side');
  const $detailPane = document.getElementById('detail-pane')!;
  $detailPane.classList.toggle('focused', state.focusTarget === 'detail');

  renderTabBar();
  const items = getFilteredItems();
  renderSideList(items);
  renderDetailTabBar();
  renderDetailContent(items);
  renderStatusBar(items);
  persistViewState();
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
    const panelId = getPanel().id;
    const isPinned = state.compareItemIds[panelId] === item.id;
    const pinClass = isPinned ? ' pinned' : '';
    const iconHtml = item.icon ? `<span style="color:${item.iconColor};margin-right:4px;flex-shrink:0;">${item.icon}</span>` : '';
    const badgeHtml = item.badge ? `<span class="side-badge">${escapeHtml(item.badge)}</span>` : '';
    const pinBtnHtml = (panelId === 'containers' || panelId === 'services')
      ? `<span class="pin-btn${isPinned ? ' active' : ''}" data-pin-id="${escapeAttr(item.id)}" title="${isPinned ? 'Unpin comparison' : 'Pin for comparison'}">\u{1F4CC}</span>`
      : '';
    html += `<div class="side-item${selected}${pinClass}" data-id="${escapeAttr(item.id)}" title="${escapeAttr(item.tooltip || item.label)}">${iconHtml}<span class="side-label">${escapeHtml(item.label)}</span>${pinBtnHtml}${badgeHtml}</div>`;
  }
  $sideList.innerHTML = html;

  // Click handlers
  $sideList.querySelectorAll('.side-item').forEach(el => {
    el.addEventListener('click', () => {
      const id = (el as HTMLElement).dataset.id;
      if (id !== undefined) selectItem(id, getFilteredItems());
    });
  });

  // Pin button click handlers
  $sideList.querySelectorAll('.pin-btn').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation(); // Don't trigger the parent side-item click
      const id = (el as HTMLElement).dataset.pinId;
      if (id !== undefined) {
        const panelId = getPanel().id;
        const current = state.compareItemIds[panelId] ?? null;
        state.compareItemIds[panelId] = current === id ? null : id;
        post({ type: 'toggleCompareItem', itemId: state.compareItemIds[panelId], panelId });
        renderAll();
      }
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
      setDetailTab(idx);
    });
  });
}

function renderDetailContent(items: PanelItem[], options: RenderDetailOptions = {}): void {
  const panel = getPanel();
  const item = getSelectedItem(items);
  const tab = panel.detailTabs[state.detailTabIndex];
  const animate = options.animate ?? true;
  const preserveScroll = options.preserveScroll ?? false;
  const restoreLogFocus = options.restoreLogFocus ?? false;
  const shouldStickToBottom = tab?.autoScrollBottom ? isNearBottom($detailContent) : false;
  const previousScrollTop = $detailContent.scrollTop;
  const activeLogInput = restoreLogFocus && document.activeElement instanceof HTMLInputElement && document.activeElement.id === 'log-filter-input'
    ? {
        selectionStart: document.activeElement.selectionStart,
        selectionEnd: document.activeElement.selectionEnd,
      }
    : null;

  if (!item || !tab) {
    $detailContent.innerHTML = renderEmptyState('\u{1F449}', 'No item selected', 'Select an item from the list');
    return;
  }

  const html = tab.render(item, state);
  $detailContent.innerHTML = html;

  if (animate) {
    $detailContent.classList.remove('fade-in');
    void $detailContent.offsetWidth; // force reflow
    $detailContent.classList.add('fade-in');
  } else {
    $detailContent.classList.remove('fade-in');
  }

  if (tab.autoScrollBottom && (shouldStickToBottom || !preserveScroll)) {
    $detailContent.scrollTop = $detailContent.scrollHeight;
  } else if (preserveScroll) {
    $detailContent.scrollTop = previousScrollTop;
  }

  if (activeLogInput) {
    const replacement = document.getElementById('log-filter-input') as HTMLInputElement | null;
    if (replacement) {
      replacement.focus();
      replacement.setSelectionRange(activeLogInput.selectionStart, activeLogInput.selectionEnd);
    }
  }
}

function setDetailTab(idx: number): void {
  if (idx === state.detailTabIndex) return;
  state.detailTabIndex = idx;
  post({ type: 'switchDetailTab', tabIndex: idx });
  renderDetailTabBar();
  renderDetailContent(getFilteredItems());
  persistViewState();
}

function renderStatusBar(items: PanelItem[]): void {
  const snapshot = state.snapshot;
  const connected = snapshot?.daemonConnected ?? false;
  const runningCount = snapshot?.containers.filter(c => c.state === 'running').length ?? 0;
  const totalCount = snapshot?.containers.length ?? 0;

  // Build contextual hints from panel actions + global features
  const item = getSelectedItem(items);
  const hintParts: string[] = [];

  if (item && snapshot) {
    const actions = getPanel().getActions(item, snapshot);
    hintParts.push(...actions.map(a => `${a.key}:${a.label}`));
  }

  // Panel-specific hints
  if (getPanel().id === 'containers') {
    hintParts.push(`a:${state.showAllContainers ? 'Running only' : 'Show all'}`);
    const sortLabel = SORT_OPTIONS.find(o => o.field === state.sortField)?.label ?? state.sortField;
    hintParts.push(`\u2195${sortLabel}${state.sortReversed ? '\u25B2' : '\u25BC'}`);
  }
  hintParts.push('/ filter', 'x actions', '? help');
  const hints = hintParts.join('  ');

  const connDot = connected ? '<span class="dot connected"></span>' : '<span class="dot disconnected"></span>';
  const connText = connected ? `${runningCount}/${totalCount}` : 'disconnected';

  let filterHtml = '';
  if (state.filterString) {
    const allItems = snapshot ? getPanel().getItems(snapshot) : [];
    filterHtml = `<span class="filter-indicator">Filter: "${escapeHtml(state.filterString)}" (${items.length} of ${allItems.length})</span>`;
  }

  // Focus + layout indicators
  const focusIndicator = `<span class="status-indicator">${state.focusTarget === 'detail' ? 'Detail' : 'List'}</span>`;
  const layoutIndicator = state.layoutMode !== 'normal' ? `<span class="status-indicator">${state.layoutMode}</span>` : '';

  $statusBar.innerHTML = `
    <span class="brand">\u26A1 SIDEKICK Docker v${__VERSION__}</span>
    <span class="hints">${escapeHtml(hints)}</span>
    ${filterHtml}
    ${layoutIndicator}
    ${focusIndicator}
    <span class="connection">${connDot}<span class="conn-text">${connText}</span></span>
  `;
}

function renderToasts(): void {
  $toastContainer.innerHTML = state.toasts.map(t => {
    const actions = t.sticky
      ? `<span class="toast-actions"><button class="toast-copy" data-toast-copy="${t.id}" title="Copy message">Copy</button><button class="toast-dismiss" data-toast-dismiss="${t.id}" title="Dismiss">\u00D7</button></span>`
      : '';
    return `<div class="toast ${t.severity}${t.sticky ? ' sticky' : ''}" data-toast-id="${t.id}">${escapeHtml(t.message)}${actions}</div>`;
  }).join('');
}

function renderScrollIndicators(): void {
  const el = $detailContent;
  const $indicators = document.getElementById('scroll-indicators')!;
  if (el.scrollHeight <= el.clientHeight) {
    $indicators.innerHTML = '';
    return;
  }
  const above = el.scrollTop;
  const below = el.scrollHeight - el.scrollTop - el.clientHeight;
  const parts: string[] = [];
  if (above > 0) parts.push(`<span class="scroll-up">\u25B2 ${Math.ceil(above / 20)}</span>`);
  if (below > 0) parts.push(`<span class="scroll-down">\u25BC ${Math.ceil(below / 20)}</span>`);
  $indicators.innerHTML = parts.join(' ');
}

function patchActiveContainerLogs(containerId: string): void {
  if (state.selectedItemId !== containerId || getPanel().id !== 'containers' || state.detailTabIndex !== 0) return;

  const entries = state.logs.get(containerId);
  if (!entries || entries.length === 0) {
    renderDetailContent(getFilteredItems(), { animate: false, preserveScroll: true, restoreLogFocus: true });
    return;
  }

  const root = $detailContent.querySelector('[data-log-root="container"]') as HTMLElement | null;
  const logContent = $detailContent.querySelector('[data-log-content]') as HTMLElement | null;
  const severityEl = $detailContent.querySelector('[data-log-severity]') as HTMLElement | null;
  const matchCountEl = $detailContent.querySelector('[data-log-match-count]') as HTMLElement | null;
  if (!root || !logContent || !severityEl || !matchCountEl || root.dataset.itemId !== containerId) {
    renderDetailContent(getFilteredItems(), { animate: false, preserveScroll: true, restoreLogFocus: true });
    return;
  }

  const counts = state.logSeverityCounts.get(containerId);
  severityEl.innerHTML = counts ? renderSeverityBadgesHtml(counts) : '';

  if (state.logFilterString) {
    renderDetailContent(getFilteredItems(), { animate: false, preserveScroll: true, restoreLogFocus: true });
    return;
  }

  const previousCount = Number(root.dataset.renderedCount ?? '0');
  const previousFirstKey = root.dataset.firstKey ?? '';
  const currentFirstKey = getLogEntryKey(entries[0]);
  const canAppend = entries.length >= previousCount && previousFirstKey === currentFirstKey;
  const shouldStickToBottom = isNearBottom($detailContent);

  if (!canAppend) {
    logContent.innerHTML = entries.map(e => colorizeLogEntry(e)).join('');
  } else if (entries.length > previousCount) {
    logContent.insertAdjacentHTML('beforeend', entries.slice(previousCount).map(e => colorizeLogEntry(e)).join(''));
  }

  root.dataset.renderedCount = String(entries.length);
  root.dataset.firstKey = currentFirstKey;
  matchCountEl.textContent = '';

  if (shouldStickToBottom) {
    $detailContent.scrollTop = $detailContent.scrollHeight;
  }
  renderScrollIndicators();
}

function patchActiveComposeLogs(projectName: string, serviceName: string | null): void {
  if (getPanel().id !== 'services' || state.detailTabIndex !== 1) return;
  const key = serviceName ? `${projectName}:${serviceName}` : projectName;
  const items = getFilteredItems();
  const selected = getSelectedItem(items);
  if (getSelectedComposeLogKey(selected) !== key) return;

  const entries = state.composeLogs.get(key);
  if (!entries || entries.length === 0) {
    renderDetailContent(items, { animate: false, preserveScroll: true });
    return;
  }

  const root = $detailContent.querySelector('[data-log-root="compose"]') as HTMLElement | null;
  const logContent = $detailContent.querySelector('[data-log-content]') as HTMLElement | null;
  if (!root || !logContent || root.dataset.itemId !== key) {
    renderDetailContent(items, { animate: false, preserveScroll: true });
    return;
  }

  const previousCount = Number(root.dataset.renderedCount ?? '0');
  const previousFirstKey = root.dataset.firstKey ?? '';
  const currentFirstKey = getLogEntryKey(entries[0]);
  const canAppend = entries.length >= previousCount && previousFirstKey === currentFirstKey;
  const shouldStickToBottom = isNearBottom($detailContent);

  if (!canAppend) {
    logContent.innerHTML = entries.map(e => colorizeLogEntry(e)).join('');
  } else if (entries.length > previousCount) {
    logContent.insertAdjacentHTML('beforeend', entries.slice(previousCount).map(e => colorizeLogEntry(e)).join(''));
  }

  root.dataset.renderedCount = String(entries.length);
  root.dataset.firstKey = currentFirstKey;

  if (shouldStickToBottom) {
    $detailContent.scrollTop = $detailContent.scrollHeight;
  }
  renderScrollIndicators();
}

function patchActiveStats(containerId: string): void {
  if (state.selectedItemId !== containerId || getPanel().id !== 'containers' || state.detailTabIndex !== 1) return;
  const items = getFilteredItems();
  const item = getSelectedItem(items);
  const tab = getPanel().detailTabs[state.detailTabIndex];
  const statsRoot = $detailContent.querySelector('[data-stats-root="container"]') as HTMLElement | null;
  if (!item || !tab || !statsRoot) {
    renderDetailContent(items, { animate: false, preserveScroll: true });
    return;
  }
  statsRoot.outerHTML = tab.render(item, state);
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
  post({ type: 'switchDetailTab', tabIndex: 0 });
  post({ type: 'selectItem', panelId: panels[idx].id, itemId: null });
  renderAll();
}

function selectItem(id: string, items: PanelItem[]): void {
  if (id === state.selectedItemId) return;
  state.selectedItemId = id;
  state.detailTabIndex = 0;
  post({ type: 'switchDetailTab', tabIndex: 0 });
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
  persistViewState();
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

function copyCurrentLogs(): void {
  if (!state.selectedItemId) return;
  let entries: SerializedLogEntry[] | undefined;
  if (getPanel().id === 'services') {
    const parts = state.selectedItemId.split(':');
    let key = '';
    if (parts[0] === 'project') {
      key = parts.slice(1).join(':');
    } else if (parts[0] === 'service') {
      key = `${parts[1]}:${parts.slice(2).join(':')}`;
    }
    entries = key ? state.composeLogs.get(key) : undefined;
  } else {
    entries = state.logs.get(state.selectedItemId);
  }
  if (!entries || entries.length === 0) {
    addToast('No logs to copy', 'warning');
    return;
  }
  const query = state.logFilterString;
  const mode = state.logFilterMode;
  let lines: string[];
  if (query) {
    lines = entries
      .filter(e => filterLine(e.message, query, mode).matched)
      .map(e => e.message);
  } else {
    lines = entries.map(e => e.message);
  }
  if (lines.length === 0) {
    addToast('No matching logs to copy', 'warning');
    return;
  }
  post({ type: 'copyLogs', text: lines.join('\n') });
}

function executeAction(action: ActionDefinition, itemId: string): void {
  if (action.actionType === 'exec') {
    post({ type: 'execContainer', containerId: itemId });
    return;
  }
  if (action.actionType === 'copyLogs') {
    copyCurrentLogs();
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

// ─── Detail pane scrolling helper ────────────────────────────────────
function scrollDetail(delta: number): void {
  $detailContent.scrollTop += delta * 24;
  renderScrollIndicators();
}

// ─── Overlay + keyboard wiring ───────────────────────────────────────
initOverlays({
  state,
  getPanel,
  getFilteredItems,
  getSelectedItem,
  executeContextAction,
  onFilterInput: (value) => {
    state.filterString = value;
    post({ type: 'filterChange', filter: state.filterString });
    const items = getFilteredItems();
    renderSideList(items);
    renderStatusBar(items);
  },
});

const keyboardContext: KeyboardContext = {
  state,
  panelCount: panels.length,
  getPanel,
  getFilteredItems,
  getSelectedItem,
  switchPanel,
  setDetailTab,
  navigateSide,
  scrollDetail,
  scrollDetailToTop: () => {
    $detailContent.scrollTop = 0;
    renderScrollIndicators();
  },
  scrollDetailToBottom: () => {
    $detailContent.scrollTop = $detailContent.scrollHeight;
    renderScrollIndicators();
  },
  executeAction,
  executeContextAction,
  showFilter,
  hideFilter,
  hideConfirm,
  hideContextMenu,
  showContextMenu,
  renderContextMenu,
  renderSortOverlay,
  renderHelpOverlay,
  renderVersionOverlay,
  renderAll,
  addToast,
  post,
  rotatePhrase,
};

document.addEventListener('keydown', (e: KeyboardEvent) => handleGlobalKeydown(e, keyboardContext));

// Log filter input handler (event delegation on detail content)
$detailContent.addEventListener('input', (e: Event) => {
  const target = e.target as HTMLInputElement;
  if (target.id === 'log-filter-input') {
    state.logFilterString = target.value;
    renderDetailContent(getFilteredItems(), { animate: false, preserveScroll: true, restoreLogFocus: true });
  }
});

$detailContent.addEventListener('click', (e: Event) => {
  const target = e.target as HTMLElement;
  if (target.id === 'log-filter-mode') {
    state.logFilterMode = state.logFilterMode === 'exact' ? 'fuzzy' : 'exact';
    renderDetailContent(getFilteredItems(), { animate: false, preserveScroll: true, restoreLogFocus: true });
  }
  if (target.id === 'copy-logs-btn') {
    copyCurrentLogs();
  }
});

// Sticky toast actions (dismiss / copy), delegated on the container
$toastContainer.addEventListener('click', (e: Event) => {
  const target = e.target as HTMLElement;
  if (target.dataset.toastDismiss !== undefined) {
    dismissToast(Number(target.dataset.toastDismiss));
    return;
  }
  if (target.dataset.toastCopy !== undefined) {
    const toast = state.toasts.find(t => t.id === Number(target.dataset.toastCopy));
    if (toast) post({ type: 'copyLogs', text: toast.message });
  }
});

// Rotate phrase on mouse interaction
document.addEventListener('mousedown', () => rotatePhrase());

// Scroll indicators for detail pane
$detailContent.addEventListener('scroll', () => renderScrollIndicators());

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
      if (msg.severityCounts) {
        state.logSeverityCounts.set(msg.containerId, msg.severityCounts);
      }
      if (state.selectedItemId === msg.containerId && getPanel().id === 'containers' && state.detailTabIndex === 0) {
        patchActiveContainerLogs(msg.containerId);
      }
      break;
    }

    case 'updateStats': {
      state.stats.set(msg.containerId, {
        stats: msg.stats,
        loading: msg.loading,
        cpuHistory: msg.cpuHistory,
        memoryHistory: msg.memoryHistory,
        networkRxRateHistory: msg.networkRxRateHistory,
        networkTxRateHistory: msg.networkTxRateHistory,
        blockReadRateHistory: msg.blockReadRateHistory,
        blockWriteRateHistory: msg.blockWriteRateHistory,
        logSeveritySeries: msg.logSeveritySeries,
      });
      if (state.selectedItemId === msg.containerId && getPanel().id === 'containers' && state.detailTabIndex === 1) {
        patchActiveStats(msg.containerId);
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
      post({ type: 'switchDetailTab', tabIndex: 0 });
      post({ type: 'selectItem', panelId: 'containers', itemId: msg.containerId });
      renderAll();
      break;
    }

    case 'updateChanges': {
      state.containerChanges.set(msg.containerId, msg.changes);
      // Re-render if viewing this container's Files tab
      if (state.selectedItemId === msg.containerId && getPanel().id === 'containers' && state.detailTabIndex === 4) {
        renderDetailContent(getFilteredItems());
      }
      break;
    }

    case 'updateLayers': {
      state.imageLayers.set(msg.imageId, msg.layers);
      // Re-render if viewing this image's Layers tab
      if (state.selectedItemId === msg.imageId && getPanel().id === 'images' && state.detailTabIndex === 1) {
        renderDetailContent(getFilteredItems());
      }
      break;
    }

    case 'updateComposeLogs': {
      const key = msg.serviceName ? `${msg.projectName}:${msg.serviceName}` : msg.projectName;
      state.composeLogs.set(key, msg.entries);
      if (getPanel().id === 'services' && state.detailTabIndex === 1) {
        patchActiveComposeLogs(msg.projectName, msg.serviceName);
      }
      break;
    }
  }
});

// ─── Initialize ──────────────────────────────────────────────────────
/**
 * Replay view state restored from getState() to the host so its viewState
 * (and stream demand) match what the webview is showing. Ordering matters:
 * the host resets tab/selection on switchPanel and tab on selectItem.
 */
function replayRestoredViewState(): void {
  if (!restoredViewState || Object.keys(restoredViewState).length === 0) return;
  post({ type: 'switchPanel', panelIndex: state.activePanelIndex });
  post({ type: 'sortChanged', field: state.sortField, reversed: state.sortReversed });
  if (state.selectedItemId) {
    post({ type: 'selectItem', panelId: getPanel().id, itemId: state.selectedItemId });
  }
  if (state.detailTabIndex > 0) {
    post({ type: 'switchDetailTab', tabIndex: state.detailTabIndex });
  }
}

function initialize(): void {
  renderAll();
  post({ type: 'webviewReady' });
  replayRestoredViewState();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
