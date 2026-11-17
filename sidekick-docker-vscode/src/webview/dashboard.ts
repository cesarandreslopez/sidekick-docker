declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};
declare const __VERSION__: string;

import type { ExtensionMessage, WebviewMessage, SerializedLogEntry } from '../types/messages';
import type { PanelDefinition, PanelItem, ActionDefinition } from './panels/types';
import type { WebviewState, SortField, ToastSeverity, PersistedViewState } from './state';
import { createInitialState, reconcileSelection, droppedLogPrefix, SORT_OPTIONS } from './state';
import { containersPanel } from './panels/containers';
import { servicesPanel } from './panels/services';
import { imagesPanel } from './panels/images';
import { volumesPanel } from './panels/volumes';
import { networksPanel } from './panels/networks';
import { colorizeLogEntry, escapeHtml, escapeAttr, renderSeverityBadges, optionAccessibleName, rovingTabIndex, buildStatusHints } from './formatters';
import { sortDirectionLabel, matchesRunningOnly } from 'sidekick-docker-shared/formatters';
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
import { parseComposeItemId } from '../types/composeItemId';
import type { KeyboardContext } from './keyboard';
import { filterLine } from 'sidekick-docker-shared/log';
import type { FilterMode } from 'sidekick-docker-shared/log';

const vscode = acquireVsCodeApi();
// TUI-aligned lifetimes; errors are sticky, so their entry is a fallback only.
const TOAST_DURATIONS: Record<ToastSeverity, number> = { error: 4000, warning: 3000, info: 2500, success: 2000 };

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
/**
 * A container "Open in Dashboard" asked for. The host posts it right after
 * revealing a hidden dashboard, before its refresh: until the next snapshot
 * arrives the target may be missing, and reconciling would select another row.
 */
let pendingFocusId: string | null = null;

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
  // The phrase is a static sibling of the tab strip: updating it never makes
  // the next render rebuild the tabs.
  $phrase.textContent = state.phrase;
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
const $statusBarMain = document.getElementById('status-bar-main')!;
const $connectionStatus = document.getElementById('connection-status')!;
const $toastContainer = document.getElementById('toast-container')!;
// The tab bar holds the tab strip (re-rendered) and the phrase (text only).
// The strip is the tablist: on the bar, the phrase sat inside the tablist as
// a child that is not a tab.
const $panelTabs = document.createElement('div');
$panelTabs.className = 'panel-tabs';
$panelTabs.setAttribute('role', 'tablist');
$panelTabs.setAttribute('aria-label', 'Resource panels');
const $phrase = document.createElement('div');
$phrase.className = 'phrase';
$tabBar.replaceChildren($panelTabs, $phrase);

// Static ARIA wiring (per-render attributes are set in the renderers)
$detailTabBar.setAttribute('role', 'tablist');
$detailTabBar.setAttribute('aria-label', 'Detail tabs');
$sideList.setAttribute('role', 'listbox');
$sideList.setAttribute('tabindex', '0');
$detailContent.setAttribute('role', 'tabpanel');
$detailContent.setAttribute('aria-label', 'Details');
// Scrollable region: keyboard-operable without knowing the app's j/k scheme.
$detailContent.setAttribute('tabindex', '0');

// ─── Helpers ─────────────────────────────────────────────────────────
function post(msg: WebviewMessage): void { vscode.postMessage(msg); }

function getPanel(): PanelDefinition { return panels[state.activePanelIndex]; }

/**
 * Whether the pane currently showing is the named tab of the named panel.
 *
 * These checks used to compare `state.detailTabIndex` against literals, so
 * inserting a tab silently repointed them — adding Labels between Config and
 * Files made the "Files" check fire on Labels instead.
 */
function isViewingTab(panelId: string, tabLabel: string): boolean {
  if (getPanel().id !== panelId) return false;
  return getPanel().detailTabs[state.detailTabIndex]?.label === tabLabel;
}


function getFilteredItems(): PanelItem[] {
  if (!state.snapshot) return [];
  let items = getPanel().getItems(state.snapshot);

  // Show all/running filter (containers only)
  if (!state.showAllContainers && getPanel().id === 'containers') {
    items = items.filter(it => {
      const c = state.snapshot!.containers.find(cc => cc.id === it.id);
      return c !== undefined && matchesRunningOnly(c.state);
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
      const val = a.sortKey - b.sortKey || fullLabel(a).localeCompare(fullLabel(b));
      return state.sortReversed && getPanel().id === 'containers' ? -val : val;
    });
  }
  return items;
}

function fullLabel(item: PanelItem): string {
  return item.label + (item.labelTail ?? '');
}

function containerSortCompare(a: PanelItem, b: PanelItem, field: SortField): number {
  const sa = state.stats.get(a.id);
  const sb = state.stats.get(b.id);
  switch (field) {
    case 'name': return containerName(a).localeCompare(containerName(b));
    case 'cpu': return (sb?.stats?.cpuPercent ?? 0) - (sa?.stats?.cpuPercent ?? 0);
    case 'mem': return (sb?.stats?.memoryPercent ?? 0) - (sa?.stats?.memoryPercent ?? 0);
    case 'net': return ((sb?.stats?.networkRx ?? 0) + (sb?.stats?.networkTx ?? 0)) - ((sa?.stats?.networkRx ?? 0) + (sa?.stats?.networkTx ?? 0));
    case 'io': return ((sb?.stats?.blockRead ?? 0) + (sb?.stats?.blockWrite ?? 0)) - ((sa?.stats?.blockRead ?? 0) + (sa?.stats?.blockWrite ?? 0));
    case 'pids': return (sb?.stats?.pids ?? 0) - (sa?.stats?.pids ?? 0);
    default: return a.sortKey - b.sortKey;
  }
}

function containerName(item: PanelItem): string {
  return state.snapshot?.containers.find(c => c.id === item.id)?.name ?? item.label;
}

function getSelectedItem(items: PanelItem[]): PanelItem | undefined {
  return items.find(it => it.id === state.selectedItemId);
}

function reconcileVisibleSelection(items: PanelItem[]): boolean {
  if (!state.snapshot) return false;
  if (pendingFocusId !== null && state.selectedItemId === pendingFocusId) return false;
  const id = reconcileSelection(items, state.selectedItemId);
  if (id === state.selectedItemId) return false;
  state.selectedItemId = id;
  post({ type: 'selectItem', panelId: getPanel().id, itemId: id });
  refetchFilesIfShowing();
  return true;
}

/**
 * The host caches filesystem changes per container (selecting one replays the
 * cached list), so re-read them whenever the Files tab comes to show a
 * container: the tab is opened, or another container is selected on it.
 */
function refetchFilesIfShowing(): void {
  if (isViewingTab('containers', 'Files') && state.selectedItemId) {
    post({ type: 'retryDetail', kind: 'changes', itemId: state.selectedItemId });
  }
}

/**
 * The markup each root was last given. Comparing against root.innerHTML never
 * matched — the browser re-serializes it (`<input …>` for `<input … />`,
 * `data-x=""` for `data-x`, entities) — so every render rebuilt every root,
 * dropping text selection and scroll. Code that patches a root's subtree in
 * place must delete its entry.
 */
const lastHtml = new WeakMap<HTMLElement, string>();

/** Preserve the focused control when background updates replace its markup. */
function replaceContent(root: HTMLElement, html: string): boolean {
  if (lastHtml.get(root) === html) return false;
  lastHtml.set(root, html);
  const active = document.activeElement instanceof HTMLElement && root.contains(document.activeElement)
    ? document.activeElement : null;
  const attrs = ['id', 'data-panel', 'data-tab', 'data-pin-id', 'data-menu-id', 'data-hint-action', 'data-retry-detail', 'data-retry-streams'];
  const attr = active && attrs.find(key => active.hasAttribute(key));
  const value = attr && active?.getAttribute(attr);
  root.innerHTML = html;
  if (active === root) return true;
  if (attr && value !== null) {
    const replacement = [...root.querySelectorAll<HTMLElement>(`[${attr}]`)].find(el => el.getAttribute(attr) === value);
    replacement?.focus({ preventScroll: true });
  }
  // The focused control is gone (its row was removed, its button no longer
  // offered): focus fell to <body>, where no key reaches the dashboard. Keep
  // it in the region instead — the root when it takes focus, else the pane.
  if (active && !root.contains(document.activeElement) && (document.activeElement === document.body || !document.activeElement)) {
    const fallback = root.hasAttribute('tabindex') ? root
      : document.getElementById(state.focusTarget === 'detail' ? 'detail-content' : 'side-list');
    fallback?.focus({ preventScroll: true });
  }
  return true;
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

function isNearBottom(el: HTMLElement, threshold = 24): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
}

/**
 * What scrolls the detail pane: in compare mode the primary log pane (the
 * pane itself does not overflow then, so j/k and paging did nothing).
 */
function activeScroller(): HTMLElement {
  return $detailContent.querySelector<HTMLElement>('[data-compare="primary"] .log-shell') ?? $detailContent;
}

function getSelectedComposeLogKey(item: PanelItem | undefined): string | null {
  if (!item) return null;
  const ref = parseComposeItemId(item.id);
  if (ref.kind === 'project') return ref.projectName;
  if (ref.kind === 'service') return `${ref.projectName}:${ref.serviceName}`;
  return null;
}

function dismissToast(id: number): void {
  const toast = state.toasts.find(t => t.id === id);
  if (toast && toast.timer !== null) window.clearTimeout(toast.timer);
  const el = $toastContainer.querySelector(`[data-toast-id="${id}"]`);
  const finalize = (): void => {
    state.toasts = state.toasts.filter(t => t.id !== id);
    el?.remove();
  };
  // Start dismiss animation
  if (el) {
    el.classList.add('dismissing');
    window.setTimeout(finalize, 200);
  } else {
    finalize();
  }
}

function toastHtml(t: { id: number; message: string; severity: ToastSeverity; sticky: boolean }): string {
  const actions = t.sticky
    ? `<span class="toast-actions"><button class="toast-copy" data-toast-copy="${t.id}" title="Copy message">Copy</button><button class="toast-dismiss" data-toast-dismiss="${t.id}" title="Dismiss">\u00D7</button></span>`
    : '';
  // No role="alert" here: the container is already a polite live region,
  // and nesting the two makes assistive tech announce the toast twice.
  return `<div class="toast ${t.severity}${t.sticky ? ' sticky' : ''}" data-toast-id="${t.id}">${escapeHtml(t.message)}${actions}</div>`;
}

function addToast(message: string, severity: ToastSeverity): void {
  // Errors are sticky, so a repeated failure (each Retry while Docker is down)
  // used to stack identical toasts; and the banner already shows the
  // connection failure's reason.
  if (severity === 'error' && (state.toasts.some(t => t.sticky && t.message === message)
    || (state.connState === 'disconnected' && message === state.connReason))) return;
  const id = ++toastIdCounter;
  // Errors stay until explicitly dismissed (with a copy affordance).
  const sticky = severity === 'error';
  const timer = sticky ? null : window.setTimeout(() => dismissToast(id), TOAST_DURATIONS[severity]);
  const toast = { id, message, severity, timer, sticky };
  state.toasts.push(toast);
  // Add just this node: rebuilding the container re-announced every toast in
  // the live region and replayed every slide-in animation.
  $toastContainer.insertAdjacentHTML('beforeend', toastHtml(toast));
}

// ─── Empty state helpers ──────────────────────────────────────────────
function renderEmptyState(emoji: string, title: string, subtitle: string): string {
  return `<div class="empty-state"><div class="empty-icon" aria-hidden="true">${emoji}</div><div class="empty-title">${escapeHtml(title)}</div><div class="empty-subtitle">${escapeHtml(subtitle)}</div></div>`;
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
  return renderEmptyStateSideWith(s.emoji, s.title, s.subtitle);
}

function renderEmptyStateSideWith(emoji: string, title: string, subtitle: string): string {
  return `<div class="empty-state-side"><div class="empty-icon" aria-hidden="true">${emoji}</div><div class="empty-title">${escapeHtml(title)}</div><div class="empty-subtitle">${escapeHtml(subtitle)}</div></div>`;
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Why the list is empty, from what hides its items. "Clear the filter or show
 * all containers" used to cover both causes, and the running-only toggle
 * alone (no filter) read as "No matching items".
 */
function renderEmptyList(): string {
  const panel = getPanel();
  const snapshot = state.snapshot;
  const runningOnly = panel.id === 'containers' && !state.showAllContainers;
  if (state.filterString && snapshot) {
    const f = state.filterString.toLowerCase();
    const matches = panel.getItems(snapshot).filter(it => panel.getSearchableText(it, snapshot).toLowerCase().includes(f));
    // Matches that only the running-only toggle hides: say so, not "nothing matches".
    return runningOnly && matches.length > 0
      ? renderEmptyStateSideWith('⌕', `No running containers match "${state.filterString}"`, `${plural(matches.length, 'stopped container')} ${matches.length === 1 ? 'matches' : 'match'} — press a to show all`)
      : renderEmptyStateSideWith('⌕', `Nothing matches "${state.filterString}"`, 'Press Esc to clear the filter');
  }
  if (runningOnly && snapshot && snapshot.containers.length > 0) {
    return renderEmptyStateSideWith('⏸', 'No running containers', `Press a to show all ${plural(snapshot.containers.length, 'container')}`);
  }
  return renderEmptyStateSide(panel.id);
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
  const selectionChanged = reconcileVisibleSelection(items);
  renderSideList(items);
  renderDetailTabBar();
  renderDetailContent(items, { animate: false, preserveScroll: !selectionChanged, restoreLogFocus: true });
  renderStatusBar(items);
  renderConnectionBanner();
  persistViewState();
}

const DEFAULT_DISCONNECTED_HINT = 'Is Docker running? Check the sidekick-docker.socketPath setting.';
let lastBannerVisible = false;
let lastInert = false;
/** Focus was inside the list or details when they went inert: give it back when they return. */
let refocusAfterInert = false;

function renderConnectionBanner(): void {
  const $banner = document.getElementById('disconnected-banner')!;
  const disconnected = state.connState === 'disconnected';
  // A Retry in progress keeps the banner (its button disabled): showing the
  // stale list again before the reconnect settled invited acting on it.
  const bannerVisible = disconnected || state.connRetrying;
  // The list is stale whenever the host is not connected — behind the banner,
  // or while a settings change re-creates the connection — so make it inert
  // too: Tab cannot reach controls behind it.
  const inert = state.connState !== 'connected';
  $banner.classList.toggle('visible', bannerVisible);
  const $main = document.getElementById('main-area')!;
  const active = document.activeElement;
  if (inert && !lastInert && active && $main.contains(active)) refocusAfterInert = true;
  $main.toggleAttribute('inert', inert);
  const $retry = document.getElementById('retry-connect') as HTMLButtonElement | null;
  if ($retry) {
    $retry.disabled = state.connRetrying;
    const label = state.connRetrying ? 'Connecting…' : 'Retry';
    if ($retry.textContent !== label) $retry.textContent = label;
  }
  if (bannerVisible && !lastBannerVisible) {
    // Retry gets focus when the banner appears.
    if (!active || active === document.body || $main.contains(active)) $retry?.focus({ preventScroll: true });
  } else if (!inert && lastInert) {
    // Hand focus back from the (now hidden) Retry button to the pane the user was in.
    const now = document.activeElement;
    if (refocusAfterInert || (lastBannerVisible && (!now || now === document.body || now === $retry))) {
      document.getElementById(state.focusTarget === 'detail' ? 'detail-content' : 'side-list')?.focus({ preventScroll: true });
    }
    refocusAfterInert = false;
  }
  lastBannerVisible = bannerVisible;
  lastInert = inert;
  // The extension says why it could not connect (permission, missing socket,
  // refused, bad host); a daemon lost mid-session only has the listing's
  // error. textContent, so the reason is never parsed as HTML.
  const $subtitle = $banner.querySelector('.banner-subtitle');
  const reason = state.connReason ?? state.snapshot?.resourceErrors?.containers ?? DEFAULT_DISCONNECTED_HINT;
  if ($subtitle && $subtitle.textContent !== reason) $subtitle.textContent = reason;
  let warning = document.getElementById('resource-warning');
  if (!warning) {
    warning = document.createElement('div');
    warning.id = 'resource-warning';
    warning.setAttribute('role', 'status');
    $banner.after(warning);
    warning.addEventListener('click', (event) => {
      if (event.target instanceof HTMLButtonElement) post({ type: 'requestRefresh' });
    });
  }
  const errors = Object.entries(state.snapshot?.resourceErrors ?? {});
  const hidden = !errors.length || bannerVisible;
  if (warning.hidden !== hidden) warning.hidden = hidden;
  // A live region: write only when the text changes, or it re-announces on every render.
  replaceContent(warning, errors.length ? `${errors.map(([kind, message]) => escapeHtml(`${kind}: ${message}`)).join(' · ')} <button>Retry refresh</button>` : '');
}

function renderTabBar(): void {
  let html = '';
  for (let i = 0; i < panels.length; i++) {
    const p = panels[i];
    const active = i === state.activePanelIndex;
    // The digit is a key hint, not part of the name ("1 Containers"): hidden
    // from assistive tech and announced as the tab's shortcut instead.
    html += `<div class="tab${active ? ' active' : ''}" role="tab" aria-selected="${active}" aria-keyshortcuts="${p.shortcutKey}" tabindex="${active ? 0 : -1}" data-panel="${i}"><span class="shortcut" aria-hidden="true">${p.shortcutKey}</span>${p.title}</div>`;
  }
  if ($phrase.textContent !== state.phrase) $phrase.textContent = state.phrase;
  if (!replaceContent($panelTabs, html)) return;
  // The bar scrolls when narrow; keep the active tab in view.
  $panelTabs.querySelector('.tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });

  // Tab click handlers
  $panelTabs.querySelectorAll('.tab').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt((el as HTMLElement).dataset.panel!, 10);
      switchPanel(idx);
    });
  });
}

const HEALTH_GLYPHS: Record<string, string> = { healthy: '\u2713', unhealthy: '\u2717', starting: '\u25CC' };
/** What the side list last scrolled to: only a new selection (or filter) may move it. */
let sideScrollKey = '';

function renderSideList(items: PanelItem[]): void {
  $sideList.setAttribute('aria-label', `${getPanel().title} items`);

  // While the first connection attempt is in flight, show skeleton rows
  // instead of a misleading "No containers" empty state.
  if (state.connState === 'connecting' && !state.snapshot) {
    $sideList.removeAttribute('aria-activedescendant');
    replaceContent($sideList, '<div class="skeleton-row"></div>'.repeat(5));
    return;
  }

  if (items.length === 0) {
    $sideList.removeAttribute('aria-activedescendant');
    replaceContent($sideList, renderEmptyList());
    return;
  }

  let html = '';
  let lastGroup: string | undefined;
  let selectedRowId: string | null = null;
  // Groups follow the state order, so they mean something only under the
  // State sort; sorted by name or CPU they repeated "Running", "Stopped",
  // "Running" down the list.
  const showGroups = getPanel().id !== 'containers' || state.sortField === 'state';
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (showGroups && item.group !== undefined && item.group !== lastGroup) {
      html += `<div class="side-group-header" role="presentation">${escapeHtml(item.group)}</div>`;
      lastGroup = item.group;
    }
    const isSelected = item.id === state.selectedItemId;
    const rowId = `side-item-${i}`;
    if (isSelected) selectedRowId = rowId;
    const panelId = getPanel().id;
    const isPinned = state.compareItemIds[panelId] === item.id;
    const pinClass = isPinned ? ' pinned' : '';
    const iconHtml = item.icon ? `<span style="color:${item.iconColor};margin-right:4px;flex-shrink:0;">${item.icon}</span>` : '';
    const healthHtml = item.health
      ? `<span class="health-badge ${item.health}" title="health: ${escapeAttr(item.health)}">${HEALTH_GLYPHS[item.health] ?? ''}</span>`
      : '';
    const badgeHtml = item.badge ? `<span class="side-badge">${escapeHtml(item.badge)}</span>` : '';
    const pinBtnHtml = (panelId === 'containers' || panelId === 'services')
      ? `<button type="button" class="pin-btn${isPinned ? ' active' : ''}" data-pin-id="${escapeAttr(item.id)}" aria-label="${isPinned ? 'Unpin' : 'Pin'} ${escapeAttr(fullLabel(item))} for comparison" aria-pressed="${isPinned}" title="${isPinned ? 'Unpin comparison' : 'Pin for comparison'}" tabindex="${isSelected ? 0 : -1}">\u{1F4CC}</button>`
      : '';
    const name = fullLabel(item);
    const actionsBtnHtml = `<button type="button" class="row-actions-btn" data-menu-id="${escapeAttr(item.id)}" aria-label="Actions for ${escapeAttr(name)}" aria-haspopup="menu" aria-expanded="${state.contextMenuVisible && isSelected}" title="Actions" tabindex="${isSelected ? 0 : -1}">\u22EF</button>`;
    // Full names: CSS ellipsizes; an image's tag stays visible (middle truncation).
    const labelHtml = item.labelTail
      ? `<span class="side-label split"><span class="side-label-head">${escapeHtml(item.label)}</span><span class="side-label-tail">${escapeHtml(item.labelTail)}</span></span>`
      : `<span class="side-label">${escapeHtml(item.label)}</span>`;
    html += `<div class="side-item${isSelected ? ' selected' : ''}${pinClass}${item.indent ? ' indented' : ''}" role="option" id="${rowId}" aria-selected="${isSelected}" aria-label="${escapeAttr(optionAccessibleName(item, isPinned))}" data-id="${escapeAttr(item.id)}" title="${escapeAttr(item.tooltip || name)}">${iconHtml}${labelHtml}${healthHtml}${pinBtnHtml}${actionsBtnHtml}${badgeHtml}</div>`;
  }
  if (!replaceContent($sideList, html)) return;
  if (selectedRowId) {
    $sideList.setAttribute('aria-activedescendant', selectedRowId);
  } else {
    $sideList.removeAttribute('aria-activedescendant');
  }

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
      if (id !== undefined) toggleComparePin(id);
    });
  });

  // Per-row actions button: select the row and open the anchored menu
  $sideList.querySelectorAll('.row-actions-btn').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = (el as HTMLElement).dataset.menuId;
      if (id === undefined) return;
      selectItem(id, getFilteredItems());
      showContextMenu(getFilteredItems());
    });
  });

  // Scroll the selection into view only when it, the filter or the sort changed: a
  // background refresh rebuilds rows ("Up 5 minutes" ticks) and used to yank
  // the list back while you were scrolling it.
  const scrollKey = [getPanel().id, state.selectedItemId ?? '', state.filterString, state.showAllContainers, state.sortField, state.sortReversed].join('\u0000');
  if (scrollKey !== sideScrollKey) {
    sideScrollKey = scrollKey;
    $sideList.querySelector('.side-item.selected')?.scrollIntoView({ block: 'nearest' });
  }
}

function renderDetailTabBar(): void {
  const panel = getPanel();
  let html = '';
  for (let i = 0; i < panel.detailTabs.length; i++) {
    const t = panel.detailTabs[i];
    const active = i === state.detailTabIndex;
    html += `<div class="detail-tab${active ? ' active' : ''}" role="tab" aria-selected="${active}" tabindex="${active ? 0 : -1}" data-tab="${i}">${t.label}</div>`;
  }
  if (!replaceContent($detailTabBar, html)) return;
  $detailTabBar.querySelector('.detail-tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });

  $detailTabBar.querySelectorAll('.detail-tab').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt((el as HTMLElement).dataset.tab!, 10);
      setDetailTab(idx);
    });
  });
}

interface RenderedLog { entries: SerializedLogEntry[]; query: string; mode: FilterMode; matched: number }
/** The entries (and filter) each mounted log pane shows, so updates can be applied in place. */
const renderedLogs = new WeakMap<HTMLElement, RenderedLog>();
/** Identity of the last full Logs render; while it holds, log updates are patched in. */
let lastLogShellKey = '';

function logEntriesFor(root: HTMLElement): SerializedLogEntry[] | undefined {
  const id = root.dataset.itemId ?? '';
  return root.dataset.logRoot?.startsWith('compose') ? state.composeLogs.get(id) : state.logs.get(id);
}

function recordMountedLogs(): void {
  for (const root of $detailContent.querySelectorAll<HTMLElement>('[data-log-root]')) {
    const entries = logEntriesFor(root);
    if (!entries) continue;
    const matched = root.querySelectorAll('[data-log-content] > .log-line').length;
    renderedLogs.set(root, { entries, query: state.logFilterString, mode: state.logFilterMode, matched });
  }
}

/** Bring one mounted log pane up to date in place; false when it needs a full render. */
function patchLogRoot(root: HTMLElement, entries: SerializedLogEntry[] | undefined): boolean {
  const rendered = renderedLogs.get(root);
  const content = root.querySelector<HTMLElement>('[data-log-content]');
  if (!rendered || !content || !entries || entries.length === 0) return false;
  const { query, mode } = rendered;
  if (query !== state.logFilterString || mode !== state.logFilterMode) return false;
  if (entries !== rendered.entries) {
    // A full ring buffer drops lines from the front as it appends: remove
    // those and append the new ones, rather than re-render every line.
    const dropped = droppedLogPrefix(rendered.entries, entries);
    if (dropped === null) return false;
    const removed = query
      ? rendered.entries.slice(0, dropped).filter(e => filterLine(e.message, query, mode).matched).length
      : dropped;
    let addedHtml = '';
    let added = 0;
    for (const e of entries.slice(rendered.entries.length - dropped)) {
      if (query) {
        const result = filterLine(e.message, query, mode);
        if (!result.matched) continue;
        addedHtml += colorizeLogEntry(e, result.matches);
      } else {
        addedHtml += colorizeLogEntry(e);
      }
      added++;
    }
    const matched = rendered.matched - removed + added;
    // "No matching logs" is not a line: showing or clearing it takes a full render.
    if (query && (rendered.matched === 0) !== (matched === 0)) return false;
    if (removed > 0 || added > 0) {
      const scroller = root.closest('[data-compare]') ? root : $detailContent;
      const stick = isNearBottom(scroller);
      let removedHeight = 0;
      if (removed > 0) {
        const first = content.firstElementChild as HTMLElement | null;
        const keep = content.children[removed] as HTMLElement | undefined;
        removedHeight = first && keep ? keep.offsetTop - first.offsetTop : 0;
        for (let i = 0; i < removed; i++) content.firstElementChild?.remove();
      }
      if (addedHtml) content.insertAdjacentHTML('beforeend', addedHtml);
      // Following the tail: stay at the bottom. Reading older lines: hold
      // them still while the buffer drops lines above.
      if (stick) scroller.scrollTop = scroller.scrollHeight;
      else if (removedHeight > 0) scroller.scrollTop = Math.max(0, scroller.scrollTop - removedHeight);
    }
    renderedLogs.set(root, { entries, query, mode, matched });
    const count = root.querySelector('[data-log-match-count]');
    if (count) count.textContent = query ? `${matched} matches` : '';
  }
  const severity = root.querySelector('[data-log-severity]');
  if (severity) {
    const counts = state.logSeverityCounts.get(root.dataset.itemId ?? '');
    const badges = counts && counts.total > 0 ? renderSeverityBadges(counts) : '';
    if (severity.innerHTML !== badges) severity.innerHTML = badges;
  }
  return true;
}

/** Apply log updates to every pane of the Logs tab in place; false when a full render is needed. */
function patchLogPanes(item: PanelItem, compareId: string | null): boolean {
  const compose = getPanel().id === 'services';
  const panes: [string, string | null][] = [[compose ? 'compose' : 'container', compose ? getSelectedComposeLogKey(item) : item.id]];
  if (compareId) {
    panes.push([compose ? 'compose-compare' : 'container-compare', compose ? getSelectedComposeLogKey({ id: compareId } as PanelItem) : compareId]);
  }
  for (const [role, id] of panes) {
    if (!id) return false;
    const entries = compose ? state.composeLogs.get(id) : state.logs.get(id);
    const root = $detailContent.querySelector<HTMLElement>(`[data-log-root="${role}"]`);
    if (!root) {
      // Still the "No logs yet" state, unless the first lines just arrived.
      if (entries && entries.length > 0) return false;
      continue;
    }
    if (root.dataset.itemId !== id || !patchLogRoot(root, entries)) return false;
  }
  // The subtree no longer matches the last full markup.
  lastHtml.delete($detailContent);
  return true;
}

function renderDetailContent(items: PanelItem[], options: RenderDetailOptions = {}): void {
  const panel = getPanel();
  const item = getSelectedItem(items);
  const tab = panel.detailTabs[state.detailTabIndex];
  const animate = options.animate ?? true;
  const preserveScroll = options.preserveScroll ?? false;
  const restoreLogFocus = options.restoreLogFocus ?? false;

  if (!item || !tab) {
    lastLogShellKey = '';
    replaceContent($detailContent, renderEmptyState('\u{1F449}', 'No item selected', 'Select an item from the list'));
    return;
  }

  const streamKind = tab.label === 'Stats' ? 'stats' : ['Logs', 'Patterns'].includes(tab.label)
    ? panel.id === 'services' ? 'composeLogs' : 'logs' : undefined;
  const streamId = panel.id === 'services' ? getSelectedComposeLogKey(item) : item.id;
  const stream = streamKind ? state.streamStates.get(`${streamKind}:${streamId}`) : undefined;
  // An empty Logs pane says itself why it is empty (waiting, stopped); the
  // status line would only repeat it. It stays for a lost or reconnecting
  // stream, where its Retry helps.
  const primaryEntries = panel.id === 'services' ? state.composeLogs.get(streamId ?? '') : state.logs.get(item.id);
  const paneSaysIt = tab.label === 'Logs' && !primaryEntries?.length
    && (stream?.state === 'loading' || stream?.state === 'empty' || stream?.state === 'ended');
  let streamHtml = '';
  if (stream && stream.state !== 'live' && !paneSaysIt) {
    // A stream that has delivered nothing yet used to say "Connecting…"
    // forever with no way out; it offers Retry in every state now.
    const labels = { loading: streamKind === 'stats' ? 'Waiting for stats…' : 'Waiting for output…', empty: 'No output received.', ended: 'Stream ended.', reconnecting: 'Reconnecting…', error: 'Stream unavailable.' };
    const message = stream.message ? ` ${stream.message}` : '';
    streamHtml = `<div role="status" class="stream-status">${escapeHtml(labels[stream.state] + message)} <button data-retry-streams>Retry</button></div>`;
  }

  // Logs: while the pane around the lines is unchanged, apply updates in place
  // (keeps the text selection, horizontal scroll and the reading position).
  const compareId = state.compareItemIds[panel.id] ?? null;
  // Stream states are part of it: an empty pane's text says why it is empty.
  const compareStreamId = compareId && panel.id === 'services' ? getSelectedComposeLogKey({ id: compareId } as PanelItem) : compareId;
  const compareStream = compareStreamId && streamKind ? state.streamStates.get(`${streamKind}:${compareStreamId}`)?.state ?? '' : '';
  const logShellKey = tab.label === 'Logs'
    ? [panel.id, item.id, compareId ?? '', streamHtml, stream?.state ?? '', compareStream, state.logFilterString, state.logFilterMode].join('\u0000')
    : '';
  if (logShellKey && preserveScroll && logShellKey === lastLogShellKey && patchLogPanes(item, compareId)) {
    renderScrollIndicators();
    return;
  }

  const shouldStickToBottom = tab.autoScrollBottom ? isNearBottom(activeScroller()) : false;
  const previousScrollTop = $detailContent.scrollTop;
  const compareScroll = [...$detailContent.querySelectorAll<HTMLElement>('[data-compare] .log-shell')].map(el => ({
    pane: el.closest<HTMLElement>('[data-compare]')?.dataset.compare, top: el.scrollTop, bottom: isNearBottom(el),
  }));
  const activeLogInput = restoreLogFocus && document.activeElement instanceof HTMLInputElement && document.activeElement.id === 'log-filter-input'
    ? {
        selectionStart: document.activeElement.selectionStart,
        selectionEnd: document.activeElement.selectionEnd,
      }
    : null;

  let html = tab.render(item, state);
  const kind = panel.id === 'containers' ? ({ Env: 'inspect', Config: 'inspect', Files: 'changes' } as const)[tab.label as 'Env' | 'Config' | 'Files']
    : panel.id === 'images' && tab.label === 'Layers' ? 'layers' : undefined;
  const load = kind ? state.detailLoads.get(`${kind}:${item.id}`) : undefined;
  if (load?.state === 'error') {
    html = `<div role="alert" class="load-error">${escapeHtml(load.message ?? 'Could not load this detail.')} <button data-retry-detail="${kind}" data-item-id="${escapeAttr(item.id)}">Retry</button></div>`;
  }
  if (replaceContent($detailContent, streamHtml + html)) recordMountedLogs();
  lastLogShellKey = logShellKey;
  // Compare panes keep their position, and start at the newest lines (they
  // used to start at the top and never follow).
  for (const el of $detailContent.querySelectorAll<HTMLElement>('[data-compare] .log-shell')) {
    const pane = el.closest<HTMLElement>('[data-compare]')?.dataset.compare;
    const previous = preserveScroll ? compareScroll.find(p => p.pane === pane) : undefined;
    el.scrollTop = !previous || previous.bottom ? el.scrollHeight : previous.top;
  }

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
  } else {
    // Another item or tab starts at the top, not at the last one's offset.
    $detailContent.scrollTop = 0;
  }

  if (activeLogInput) {
    const replacement = document.getElementById('log-filter-input') as HTMLInputElement | null;
    if (replacement) {
      replacement.focus({ preventScroll: true });
      replacement.setSelectionRange(activeLogInput.selectionStart, activeLogInput.selectionEnd);
    }
  }
  renderScrollIndicators();
}

function setDetailTab(idx: number): void {
  if (idx === state.detailTabIndex) return;
  state.detailTabIndex = idx;
  post({ type: 'switchDetailTab', tabIndex: idx });
  refetchFilesIfShowing();
  renderDetailTabBar();
  renderDetailContent(getFilteredItems());
  persistViewState();
}

function renderStatusBar(items: PanelItem[]): void {
  const snapshot = state.snapshot;
  // Counted as the running-only toggle (and VS Code's status bar) count it.
  const runningCount = snapshot?.containers.filter(c => matchesRunningOnly(c.state)).length ?? 0;
  const totalCount = snapshot?.containers.length ?? 0;

  // Build contextual hints from panel actions + global features
  const item = getSelectedItem(items);
  const hints = buildStatusHints({
    actions: item && snapshot ? getPanel().getActions(item, snapshot) : [],
    panelId: getPanel().id,
    showAllContainers: state.showAllContainers,
    sortLabel: SORT_OPTIONS.find(o => o.field === state.sortField)?.label ?? state.sortField,
    sortDirection: sortDirectionLabel(state.sortField, state.sortReversed),
  });

  // Trailing global hints are clickable chips (mouse path for overlays)
  const chipsHtml = '<button type="button" class="hint-chip" data-hint-action="filter">/ filter</button>'
    + '<button type="button" class="hint-chip" data-hint-action="actions">x actions</button>'
    + '<button type="button" class="hint-chip" data-hint-action="help">? help</button>'
    + '<button type="button" class="hint-chip" data-hint-action="refresh" title="Refresh now"><span aria-hidden="true">\u21BB</span> refresh</button>';

  let connDot: string;
  let connText: string;
  if (state.connState === 'connecting') {
    connDot = '<span class="dot connecting" aria-hidden="true"></span>';
    connText = 'connecting\u2026';
  } else if (state.connState === 'connected') {
    connDot = '<span class="dot connected" aria-hidden="true"></span>';
    connText = `${runningCount}/${totalCount} running`;
  } else {
    connDot = '<span class="dot disconnected" aria-hidden="true"></span>';
    connText = 'disconnected';
  }

  let filterHtml = '';
  if (state.filterString) {
    const allItems = snapshot ? getPanel().getItems(snapshot) : [];
    filterHtml = `<span class="filter-indicator">Filter: "${escapeHtml(state.filterString)}" (${items.length} of ${allItems.length})</span>`;
  }

  // Focus + layout indicators
  const focusIndicator = `<span class="status-indicator">${state.focusTarget === 'detail' ? 'Detail' : 'List'}</span>`;
  const layoutIndicator = state.layoutMode !== 'normal' ? `<span class="status-indicator">${state.layoutMode}</span>` : '';

  // Replaced only when it changes, keeping a focused chip focused. The chips
  // sit outside .hints, whose ellipsis used to clip them. The connection
  // indicator is a live region: written only when its text changes.
  replaceContent($statusBarMain, `<span class="brand">\u26A1 SIDEKICK Docker v${__VERSION__}</span>`
    + `<span class="hints">${escapeHtml(hints)}</span><span class="hint-chips">${chipsHtml}</span>`
    + `${filterHtml}${layoutIndicator}${focusIndicator}`);
  replaceContent($connectionStatus, `${connDot}<span class="conn-text">${connText}</span>`);
}

function renderScrollIndicators(): void {
  const el = activeScroller();
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

/** Logs arrived for a container: re-render its pane (in place when possible) if on screen. */
function patchActiveContainerLogs(containerId: string): void {
  if (!isViewingTab('containers', 'Logs')) return;
  if (state.selectedItemId !== containerId && state.compareItemIds.containers !== containerId) return;
  renderDetailContent(getFilteredItems(), { animate: false, preserveScroll: true, restoreLogFocus: true });
}

/** Compose logs arrived for a project/service key: same, for the Services Logs tab. */
function patchActiveComposeLogs(key: string): void {
  if (!isViewingTab('services', 'Logs')) return;
  const items = getFilteredItems();
  const compareId = state.compareItemIds.services;
  const compareKey = compareId ? getSelectedComposeLogKey({ id: compareId } as PanelItem) : null;
  if (getSelectedComposeLogKey(getSelectedItem(items)) !== key && compareKey !== key) return;
  renderDetailContent(items, { animate: false, preserveScroll: true, restoreLogFocus: true });
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
  lastHtml.delete($detailContent);
}

// ─── Actions ─────────────────────────────────────────────────────────
function switchPanel(idx: number): void {
  if (idx < 0 || idx >= panels.length || idx === state.activePanelIndex) return;
  state.activePanelIndex = idx;
  state.selectedItemId = null;
  state.detailTabIndex = 0;
  state.filterString = '';
  pendingFocusId = null;
  hideFilter();
  hideContextMenu();
  post({ type: 'switchPanel', panelIndex: idx });
  post({ type: 'switchDetailTab', tabIndex: 0 });
  post({ type: 'selectItem', panelId: panels[idx].id, itemId: null });
  post({ type: 'toggleCompareItem', panelId: panels[idx].id, itemId: state.compareItemIds[panels[idx].id] ?? null });
  renderAll();
}

function selectItem(id: string, items: PanelItem[]): void {
  if (id === state.selectedItemId) return;
  state.selectedItemId = id;
  pendingFocusId = null;
  post({ type: 'selectItem', panelId: getPanel().id, itemId: id });
  refetchFilesIfShowing();

  // Notify extension about compose service selection for log streaming
  if (getPanel().id === 'services') {
    const ref = parseComposeItemId(id);
    if (ref.kind === 'project') {
      post({ type: 'selectComposeService', projectName: ref.projectName, serviceName: null });
    } else if (ref.kind === 'service') {
      post({ type: 'selectComposeService', projectName: ref.projectName, serviceName: ref.serviceName });
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
    const ref = parseComposeItemId(state.selectedItemId);
    let key = '';
    if (ref.kind === 'project') {
      key = ref.projectName;
    } else if (ref.kind === 'service') {
      key = `${ref.projectName}:${ref.serviceName}`;
    }
    entries = key ? state.composeLogs.get(key) : undefined;
  } else {
    entries = state.logs.get(state.selectedItemId);
  }
  if (!entries || entries.length === 0) {
    addToast('No logs to copy', 'warning');
    return;
  }
  // Copy what is on screen: the log filter applies only where its bar is
  // shown (the Logs tab), not from another tab where it is invisible.
  const query = isViewingTab(getPanel().id, 'Logs') ? state.logFilterString : '';
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
  // The list already shows there is nothing to do (a prune with no
  // candidates): say so, rather than ask a red "cannot be undone" question.
  if (action.nothingToDo) {
    addToast(action.nothingToDo, 'info');
    return;
  }
  if (action.confirm) {
    showConfirm(action.confirmMessage || 'Are you sure?', () => {
      post({ type: 'action', actionType: action.actionType, itemId, panelId: getPanel().id });
    }, action.confirmSeverity);
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
  activeScroller().scrollTop += delta * 24;
  renderScrollIndicators();
}

/** Scroll the secondary compare log pane (keyboard Shift+J/K). */
function scrollComparePane(delta: number): void {
  const pane = $detailContent.querySelector('.log-compare-pane[data-compare="secondary"] .log-shell') as HTMLElement | null;
  if (pane) pane.scrollTop += delta * 24;
}

/** Toggle the compare pin for an item on the active panel (pin button + m key). */
function toggleComparePin(itemId: string): void {
  const panel = getPanel();
  const pinning = (state.compareItemIds[panel.id] ?? null) !== itemId;
  state.compareItemIds[panel.id] = pinning ? itemId : null;
  post({ type: 'toggleCompareItem', itemId: state.compareItemIds[panel.id], panelId: panel.id });
  if (pinning) {
    const item = getFilteredItems().find(it => it.id === itemId);
    addToast(`Pinned ${item ? fullLabel(item) : itemId} for comparison`, 'info');
    // The split view only renders on the Logs tab (TUI parity): go there.
    const logsTab = panel.detailTabs.findIndex(t => t.autoScrollBottom);
    if (logsTab >= 0) setDetailTab(logsTab);
  } else {
    addToast('Unpinned comparison', 'info');
  }
  renderAll();
}

// ─── Overlay + keyboard wiring ───────────────────────────────────────
initOverlays({
  state,
  getPanel,
  getFilteredItems,
  getSelectedItem,
  getSelectedRowRect: () => $sideList.querySelector('.side-item.selected')?.getBoundingClientRect() ?? null,
  executeContextAction,
  onFilterInput: (value) => {
    state.filterString = value;
    renderAll();
  },
  onSortSelect: (index) => {
    state.sortField = SORT_OPTIONS[index].field;
    state.sortMenuIndex = index;
    state.sortOverlayVisible = false;
    post({ type: 'sortChanged', field: state.sortField, reversed: state.sortReversed });
    renderSortOverlay();
    renderAll();
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
    activeScroller().scrollTop = 0;
    renderScrollIndicators();
  },
  scrollDetailToBottom: () => {
    const scroller = activeScroller();
    scroller.scrollTop = scroller.scrollHeight;
    renderScrollIndicators();
  },
  getDetailPageRows: () => Math.max(1, Math.floor(activeScroller().clientHeight / 24)),
  scrollComparePane,
  toggleComparePin,
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
document.addEventListener('focusin', (e) => {
  if (!(e.target instanceof Node)) return;
  if ($sideList.contains(e.target)) state.focusTarget = 'side';
  else if (document.getElementById('detail-pane')!.contains(e.target)) state.focusTarget = 'detail';
  $sideList.classList.toggle('focused', state.focusTarget === 'side');
  document.getElementById('detail-pane')!.classList.toggle('focused', state.focusTarget === 'detail');
});

// ARIA tabs: Enter/Space activates the focused tab; arrows/Home/End move
// between tabs (roving tabindex — only the active tab is in the Tab order).
function activateTabOnKey(e: KeyboardEvent, datasetKey: 'panel' | 'tab', activate: (idx: number) => void): void {
  const tab = (e.target as HTMLElement).closest('[role="tab"]') as HTMLElement | null;
  if (!tab) return;
  const raw = tab.dataset[datasetKey];
  if (raw === undefined) return;
  const bar = tab.parentElement;
  const count = bar ? bar.querySelectorAll('[role="tab"]').length : 0;
  const next = e.key === 'Enter' || e.key === ' ' ? parseInt(raw, 10) : rovingTabIndex(e.key, parseInt(raw, 10), count);
  if (next === null) return;
  e.preventDefault();
  e.stopPropagation();
  activate(next);
  (bar?.querySelector(`[data-${datasetKey}="${next}"]`) as HTMLElement | null)?.focus();
}
$tabBar.addEventListener('keydown', (e: KeyboardEvent) => activateTabOnKey(e, 'panel', switchPanel));
$detailTabBar.addEventListener('keydown', (e: KeyboardEvent) => activateTabOnKey(e, 'tab', setDetailTab));

// Right-click a side-list row: select it and open the menu at the pointer.
// The context-menu key and Shift+F10 fire on the focused list itself (rows
// are aria-activedescendant options), so they open the selected row's menu.
$sideList.addEventListener('contextmenu', (e: MouseEvent) => {
  const row = (e.target as HTMLElement).closest('.side-item') as HTMLElement | null;
  e.preventDefault();
  if (!row) {
    showContextMenu(getFilteredItems());
    return;
  }
  const id = row.dataset.id;
  if (id === undefined) return;
  selectItem(id, getFilteredItems());
  // A keyboard-invoked event on a row's button carries no pointer position.
  showContextMenu(getFilteredItems(), e.clientX || e.clientY ? { x: e.clientX, y: e.clientY } : undefined);
});

// Clickable status-bar hint chips (mouse path for keyboard-only overlays)
$statusBar.addEventListener('click', (e: Event) => {
  const chip = (e.target as HTMLElement).closest('.hint-chip') as HTMLElement | null;
  if (!chip) return;
  // While not connected the list is stale (and behind the banner, or inert).
  if (state.connState !== 'connected' && (chip.dataset.hintAction === 'filter' || chip.dataset.hintAction === 'actions')) return;
  switch (chip.dataset.hintAction) {
    case 'filter':
      showFilter();
      break;
    case 'actions':
      showContextMenu(getFilteredItems());
      break;
    case 'help':
      state.helpOverlayVisible = !state.helpOverlayVisible;
      renderHelpOverlay();
      break;
    case 'refresh':
      post({ type: 'requestRefresh' });
      addToast('Refreshing\u2026', 'info');
      break;
  }
});

// Retry button on the disconnected banner
document.getElementById('retry-connect')!.addEventListener('click', () => {
  if (state.connRetrying) return;
  state.connState = 'connecting';
  state.connRetrying = true;
  renderAll();
  post({ type: 'retryConnect' });
});

// Log filter input handler (event delegation on detail content)
$detailContent.addEventListener('input', (e: Event) => {
  const target = e.target as HTMLInputElement;
  if (target.id === 'log-filter-input') {
    state.logFilterString = target.value;
    renderDetailContent(getFilteredItems(), { animate: false, preserveScroll: true, restoreLogFocus: true });
  }
});

$detailContent.addEventListener('click', (e: Event) => {
  const target = e.target instanceof HTMLElement ? e.target.closest<HTMLElement>('button') : null;
  if (target?.hasAttribute('data-retry-detail')) {
    const kind = target.dataset.retryDetail;
    if ((kind === 'inspect' || kind === 'changes' || kind === 'layers') && target.dataset.itemId) {
      post({ type: 'retryDetail', kind, itemId: target.dataset.itemId });
    }
    return;
  }
  if (target?.hasAttribute('data-retry-streams')) {
    post({ type: 'retryStreams' });
    return;
  }
  const clicked = e.target as HTMLElement;
  if (clicked.id === 'log-filter-mode') {
    state.logFilterMode = state.logFilterMode === 'exact' ? 'fuzzy' : 'exact';
    renderDetailContent(getFilteredItems(), { animate: false, preserveScroll: true, restoreLogFocus: true });
  }
  if (clicked.id === 'copy-logs-btn') {
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
    if (toast) post({ type: 'copyText', text: toast.message });
  }
});

// Rotate phrase on mouse interaction
document.addEventListener('mousedown', () => rotatePhrase());

// Scroll indicators for detail pane (capture: compare panes scroll themselves)
$detailContent.addEventListener('scroll', () => renderScrollIndicators(), true);

// ─── Message handling ────────────────────────────────────────────────
window.addEventListener('message', (event: MessageEvent<ExtensionMessage>) => {
  const msg = event.data;

  switch (msg.type) {
    case 'updateState': {
      state.snapshot = msg.snapshot;
      state.connState = msg.snapshot.daemonConnected ? 'connected' : 'disconnected';
      if (msg.snapshot.daemonConnected) state.connRetrying = false;
      // The first snapshot after "Open in Dashboard" settles it: the target is
      // there (kept) or it is gone (reconciled like any other selection).
      pendingFocusId = null;
      renderAll();
      break;
    }

    case 'connectionState': {
      if (msg.state === 'connecting') {
        // A reconnect after a failure keeps the banner; one from a working
        // connection (a settings change) only makes the list inert.
        if (state.connState === 'disconnected') state.connRetrying = true;
      } else {
        state.connRetrying = false;
        state.connReason = msg.reason ?? null;
      }
      state.connState = msg.state;
      renderAll();
      break;
    }

    case 'updateLogs': {
      state.logs.set(msg.containerId, msg.entries);
      if (msg.severityCounts) {
        state.logSeverityCounts.set(msg.containerId, msg.severityCounts);
      }
      if (isViewingTab('containers', 'Logs')) {
        patchActiveContainerLogs(msg.containerId);
      } else if (state.selectedItemId === msg.containerId && isViewingTab('containers', 'Patterns')) {
        renderDetailContent(getFilteredItems(), { animate: false, preserveScroll: true });
      }
      break;
    }

    case 'updateStats': {
      // Two producers feed this: the live stream for the selected container
      // (carries history series) and the one-shot sampler for every other row
      // (values only, so list sorting has real numbers). Merge rather than
      // replace, so a sampler tick can never blank the streamed container's
      // sparklines just because it had no histories to send.
      const prev = state.stats.get(msg.containerId);
      state.stats.set(msg.containerId, {
        stats: msg.stats,
        loading: msg.loading,
        cpuHistory: msg.cpuHistory ?? prev?.cpuHistory,
        memoryHistory: msg.memoryHistory ?? prev?.memoryHistory,
        networkRxRateHistory: msg.networkRxRateHistory ?? prev?.networkRxRateHistory,
        networkTxRateHistory: msg.networkTxRateHistory ?? prev?.networkTxRateHistory,
        blockReadRateHistory: msg.blockReadRateHistory ?? prev?.blockReadRateHistory,
        blockWriteRateHistory: msg.blockWriteRateHistory ?? prev?.blockWriteRateHistory,
        logSeveritySeries: msg.logSeveritySeries ?? prev?.logSeveritySeries,
      });
      if (state.selectedItemId === msg.containerId && isViewingTab('containers', 'Stats')) {
        patchActiveStats(msg.containerId);
      }
      break;
    }

    case 'detailLoad': {
      state.detailLoads.set(`${msg.update.kind}:${msg.update.itemId}`, msg.update);
      if (state.selectedItemId === msg.update.itemId) renderDetailContent(getFilteredItems(), { animate: false, preserveScroll: true, restoreLogFocus: true });
      break;
    }
    case 'streamState': {
      state.streamStates.set(`${msg.update.kind}:${msg.update.itemId}`, msg.update);
      renderDetailContent(getFilteredItems(), { animate: false, preserveScroll: true, restoreLogFocus: true });
      break;
    }
    case 'updateInspect': {
      state.containerDetails.set(msg.containerId, msg.details);
      if (state.selectedItemId === msg.containerId && (isViewingTab('containers', 'Env') || isViewingTab('containers', 'Config'))) {
        renderDetailContent(getFilteredItems(), { animate: false, preserveScroll: true });
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
      state.filterString = '';
      state.showAllContainers = true;
      hideFilter();
      // Switch to containers panel and select the specified container
      if (state.activePanelIndex !== 0) {
        state.activePanelIndex = 0;
        state.filterString = '';
        hideFilter();
        hideContextMenu();
        post({ type: 'switchPanel', panelIndex: 0 });
        post({ type: 'toggleCompareItem', panelId: 'containers', itemId: state.compareItemIds.containers ?? null });
      }
      state.selectedItemId = msg.containerId;
      pendingFocusId = msg.containerId;
      state.detailTabIndex = 0;
      post({ type: 'switchDetailTab', tabIndex: 0 });
      post({ type: 'selectItem', panelId: 'containers', itemId: msg.containerId });
      renderAll();
      break;
    }

    case 'updateChanges': {
      state.containerChanges.set(msg.containerId, msg.changes);
      // The host's fetch time, not ours: a cached list replayed on selection
      // must not read as fresh.
      state.containerChangesAt.set(msg.containerId, Date.parse(msg.fetchedAt));
      // Re-render if viewing this container's Files tab (a refetch keeps the scroll)
      if (state.selectedItemId === msg.containerId && isViewingTab('containers', 'Files')) {
        renderDetailContent(getFilteredItems(), { animate: false, preserveScroll: true });
      }
      break;
    }

    case 'updateLayers': {
      state.imageLayers.set(msg.imageId, msg.layers);
      // Re-render if viewing this image's Layers tab
      if (state.selectedItemId === msg.imageId && isViewingTab('images', 'Layers')) {
        renderDetailContent(getFilteredItems(), { animate: false, preserveScroll: true });
      }
      break;
    }

    case 'updateComposeLogs': {
      const key = msg.serviceName ? `${msg.projectName}:${msg.serviceName}` : msg.projectName;
      state.composeLogs.set(key, msg.entries);
      patchActiveComposeLogs(key);
      break;
    }
  }
});

// ─── Initialize ──────────────────────────────────────────────────────
/**
 * Replay view state restored from getState() to the host so its viewState
 * (and stream demand) match what the webview is showing. Ordering matters:
 * the host resets tab/selection on switchPanel.
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
