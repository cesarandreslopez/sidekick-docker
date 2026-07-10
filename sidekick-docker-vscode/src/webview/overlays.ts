declare const __VERSION__: string;

import type { PanelDefinition, PanelItem, ActionDefinition } from './panels/types';
import type { WebviewState } from './state';
import { SORT_OPTIONS } from './state';
import { escapeHtml } from './formatters';

export const GLOBAL_KEYBINDINGS = [
  { key: '1-5', label: 'Switch panel' },
  { key: 'j/k', label: 'Navigate / scroll' },
  { key: 'g/G', label: 'Jump to first / last' },
  { key: 'Tab', label: 'Toggle focus' },
  { key: '[/]', label: 'Cycle detail tabs' },
  { key: 'z', label: 'Cycle layout (Normal/Wide/Expanded)' },
  { key: '/', label: 'Filter items' },
  { key: 'f', label: 'Focus log filter (Logs tab)' },
  { key: 'x', label: 'Actions menu' },
  { key: 'm', label: 'Pin/unpin for compare (Containers/Services)' },
  { key: 'J/K', label: 'Scroll compare pane' },
  { key: 'a', label: 'Toggle all/running (Containers)' },
  { key: 'o', label: 'Sort menu (Containers)' },
  { key: 'R', label: 'Reverse sort (Containers)' },
  { key: 'PgUp/Dn', label: 'Page scroll' },
  { key: '^d/^u', label: 'Half-page scroll' },
  { key: 'F5', label: 'Refresh' },
  { key: 'V', label: 'Version info' },
  { key: '?', label: 'This help' },
];

export type ConfirmSeverity = 'low' | 'high' | 'batch';

/** Callbacks/state the overlay module needs from the dashboard. */
export interface OverlayDeps {
  state: WebviewState;
  getPanel(): PanelDefinition;
  getFilteredItems(): PanelItem[];
  getSelectedItem(items: PanelItem[]): PanelItem | undefined;
  /** Bounding rect of the selected side-list row, for anchoring the keyboard-opened menu. */
  getSelectedRowRect(): DOMRect | null;
  executeContextAction(idx: number, actions: ActionDefinition[]): void;
  onFilterInput(value: string): void;
}

let deps: OverlayDeps;
let previouslyFocused: Element | null = null;

// ─── DOM refs (owned by this module) ─────────────────────────────────
const $confirmOverlay = document.getElementById('confirm-overlay')!;
const $confirmMessage = $confirmOverlay.querySelector('.message')!;
const $confirmYes = $confirmOverlay.querySelector('.btn-confirm') as HTMLButtonElement;
const $confirmNo = $confirmOverlay.querySelector('.btn-cancel') as HTMLButtonElement;
const $filterOverlay = document.getElementById('filter-overlay')!;
const $filterInput = document.getElementById('filter-input') as HTMLInputElement;
const $contextMenu = document.getElementById('context-menu')!;
const $sortOverlay = document.getElementById('sort-overlay')!;
const $helpOverlay = document.getElementById('help-overlay')!;
const $versionOverlay = document.getElementById('version-overlay')!;

export function initOverlays(d: OverlayDeps): void {
  deps = d;

  $contextMenu.setAttribute('role', 'menu');

  // Confirm overlay buttons
  $confirmYes.addEventListener('click', () => {
    deps.state.confirmCallback?.();
    hideConfirm();
  });
  $confirmNo.addEventListener('click', () => hideConfirm());

  // Backdrop click closes the confirm overlay
  $confirmOverlay.addEventListener('click', (e: Event) => {
    if (e.target === $confirmOverlay) hideConfirm();
  });

  // One shared outside-click closer for the non-modal/context overlays.
  // Sort/help/version are full-screen backdrops, so "outside" means the
  // backdrop itself; the context menu closes on any press outside it.
  document.addEventListener('mousedown', (e: Event) => {
    const target = e.target as Node;
    if (deps.state.contextMenuVisible && !$contextMenu.contains(target)) {
      hideContextMenu();
    }
    if (deps.state.sortOverlayVisible && target === $sortOverlay) {
      deps.state.sortOverlayVisible = false;
      renderSortOverlay();
    }
    if (deps.state.helpOverlayVisible && target === $helpOverlay) {
      deps.state.helpOverlayVisible = false;
      renderHelpOverlay();
    }
    if (deps.state.versionOverlayVisible && target === $versionOverlay) {
      deps.state.versionOverlayVisible = false;
      renderVersionOverlay();
    }
  });

  // Filter input handler
  $filterInput.addEventListener('input', () => {
    deps.onFilterInput($filterInput.value);
  });
}

// ─── Confirm overlay ─────────────────────────────────────────────────
export function showConfirm(message: string, callback: () => void, severity: ConfirmSeverity = 'high'): void {
  deps.state.confirmVisible = true;
  deps.state.confirmMessage = message;
  deps.state.confirmCallback = callback;
  $confirmMessage.textContent = message;
  $confirmOverlay.classList.remove('severity-low', 'severity-high', 'severity-batch');
  $confirmOverlay.classList.add('visible', `severity-${severity}`);
  // Record focus and default to the safe button; Enter activates the
  // focused button, so confirming requires y or a deliberate focus move.
  previouslyFocused = document.activeElement;
  $confirmNo.focus();
}

export function hideConfirm(): void {
  deps.state.confirmVisible = false;
  deps.state.confirmCallback = null;
  $confirmOverlay.classList.remove('visible');
  if (previouslyFocused instanceof HTMLElement && document.contains(previouslyFocused)) {
    previouslyFocused.focus();
  } else {
    (document.activeElement as HTMLElement | null)?.blur();
  }
  previouslyFocused = null;
}

// ─── Filter overlay ──────────────────────────────────────────────────
export function showFilter(): void {
  deps.state.filterVisible = true;
  $filterOverlay.classList.add('visible');
  $filterInput.value = deps.state.filterString;
  $filterInput.focus();
}

export function hideFilter(): void {
  deps.state.filterVisible = false;
  $filterOverlay.classList.remove('visible');
  $filterInput.blur();
}

// ─── Context menu ────────────────────────────────────────────────────
export function showContextMenu(items: PanelItem[], anchor?: { x: number; y: number }): void {
  const item = deps.getSelectedItem(items);
  if (!item || !deps.state.snapshot) return;
  const actions = deps.getPanel().getActions(item, deps.state.snapshot);
  if (actions.length === 0) return;

  deps.state.contextMenuVisible = true;
  deps.state.contextMenuIndex = 0;
  renderContextMenu(actions);

  // Anchor at the pointer, or at the selected row for keyboard invocation.
  let x: number;
  let y: number;
  if (anchor) {
    x = anchor.x;
    y = anchor.y;
  } else {
    const rect = deps.getSelectedRowRect();
    if (rect) {
      x = rect.right;
      y = rect.top;
    } else {
      x = window.innerWidth / 2;
      y = window.innerHeight / 3;
    }
  }

  // Clamp to the viewport (the menu has layout even while hidden).
  $contextMenu.style.transform = '';
  const menuRect = $contextMenu.getBoundingClientRect();
  x = Math.max(8, Math.min(x, window.innerWidth - menuRect.width - 8));
  y = Math.max(8, Math.min(y, window.innerHeight - menuRect.height - 8));
  $contextMenu.style.left = `${x}px`;
  $contextMenu.style.top = `${y}px`;
  $contextMenu.classList.add('visible');
}

export function hideContextMenu(): void {
  deps.state.contextMenuVisible = false;
  $contextMenu.classList.remove('visible');
}

export function renderContextMenu(actions: ActionDefinition[]): void {
  let html = '';
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i];
    const selected = i === deps.state.contextMenuIndex ? ' selected' : '';
    html += `<div class="menu-item${selected}" role="menuitem" data-idx="${i}" data-action="${a.actionType}">${a.label}<span class="key">${a.key}</span></div>`;
  }
  $contextMenu.innerHTML = html;

  $contextMenu.querySelectorAll('.menu-item').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt((el as HTMLElement).dataset.idx!, 10);
      deps.executeContextAction(idx, actions);
    });
  });
}

// ─── Sort overlay ────────────────────────────────────────────────────
export function renderSortOverlay(): void {
  const state = deps.state;
  if (!state.sortOverlayVisible) {
    $sortOverlay.classList.remove('visible');
    return;
  }
  let html = '<div class="overlay-title">\u2195 Sort by</div>';
  for (let i = 0; i < SORT_OPTIONS.length; i++) {
    const opt = SORT_OPTIONS[i];
    const selected = i === state.sortMenuIndex ? ' selected' : '';
    const current = opt.field === state.sortField;
    const indicator = current ? (state.sortReversed ? ' \u25B2' : ' \u25BC') : '';
    const currentClass = current ? ' current' : '';
    html += `<div class="sort-item${selected}${currentClass}" data-idx="${i}">${escapeHtml(opt.label)}${indicator}</div>`;
  }
  html += '<div class="overlay-hint">j/k select  Enter apply  R reverse  Esc close</div>';
  $sortOverlay.innerHTML = html;
  $sortOverlay.classList.add('visible');
}

// ─── Help overlay ────────────────────────────────────────────────────
export function renderHelpOverlay(): void {
  const state = deps.state;
  if (!state.helpOverlayVisible) {
    $helpOverlay.classList.remove('visible');
    return;
  }

  let html = '<div class="overlay-title">\u26A1 SIDEKICK Docker</div>';
  html += '<div class="overlay-section">Navigation</div>';
  for (const b of GLOBAL_KEYBINDINGS) {
    html += `<div class="help-row"><span class="help-key">${escapeHtml(b.key)}</span><span class="help-label">${escapeHtml(b.label)}</span></div>`;
  }

  // Panel-specific actions
  const items = deps.getFilteredItems();
  const item = deps.getSelectedItem(items);
  if (item && state.snapshot) {
    const actions = deps.getPanel().getActions(item, state.snapshot);
    if (actions.length > 0) {
      html += `<div class="overlay-section">${escapeHtml(deps.getPanel().title)} Actions</div>`;
      for (const a of actions) {
        const cls = a.confirm ? ' destructive' : '';
        html += `<div class="help-row"><span class="help-key${cls}">${escapeHtml(a.key)}</span><span class="help-label${cls}">${escapeHtml(a.label)}${a.confirm ? ' \u26A0' : ''}</span></div>`;
      }
    }
  }

  html += '<div class="overlay-hint">Press ? or Esc to close</div>';
  $helpOverlay.innerHTML = html;
  $helpOverlay.classList.add('visible');
}

// ─── Version overlay ─────────────────────────────────────────────────
export function renderVersionOverlay(): void {
  const state = deps.state;
  if (!state.versionOverlayVisible) {
    $versionOverlay.classList.remove('visible');
    return;
  }
  $versionOverlay.innerHTML = `
    <div class="overlay-title">\u26A1 SIDEKICK</div>
    <div class="version-tagline">Docker v${__VERSION__}</div>
    <div class="version-divider"></div>
    <div class="version-phrase">"${escapeHtml(state.phrase)}"</div>
    <div class="version-divider"></div>
    <div class="overlay-hint">Press V or Esc to close</div>
  `;
  $versionOverlay.classList.add('visible');
}
