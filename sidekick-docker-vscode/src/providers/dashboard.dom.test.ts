import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { buildSync } from 'esbuild';
import { getDashboardHtml } from './dashboardHtml';
import type { DashboardStateSnapshot, ExtensionMessage, WebviewMessage } from '../types/messages';

vi.mock('vscode', () => ({ Uri: { joinPath: () => 'dashboard.js' } }));

let bundle: string;
let dom: JSDOM;
let sent: WebviewMessage[];
function snapshot(ids = ['alpha', 'beta']): DashboardStateSnapshot {
  return {
    containers: ids.map(id => ({ id, name: id, state: 'running', status: 'Up', image: 'test', ports: [], created: '2026-01-01', labels: {} })),
    images: [], volumes: [], networks: [], composeProjects: [], daemonConnected: true, lastRefresh: null,
  };
}
function receive(message: ExtensionMessage): void {
  dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: message }));
}
function element(selector: string): HTMLElement {
  const el = dom.window.document.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`Missing ${selector}`);
  return el;
}
function key(value: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new dom.window.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true, ...init });
  (dom.window.document.activeElement ?? dom.window.document).dispatchEvent(event);
  return event;
}
function lastSelection() { return sent.filter(m => m.type === 'selectItem').at(-1); }

beforeAll(() => {
  bundle = buildSync({ entryPoints: ['src/webview/dashboard.ts'], bundle: true, write: false, platform: 'browser', format: 'iife', define: { __VERSION__: '"test"' } }).outputFiles[0].text;
});
beforeEach(() => {
  sent = [];
  const html = getDashboardHtml({ asWebviewUri: () => 'dashboard.js', cspSource: 'test' } as never, {} as never, 'test');
  dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true });
  Object.assign(dom.window, { acquireVsCodeApi: () => ({ postMessage: (m: WebviewMessage) => sent.push(m), getState: () => undefined, setState: () => {} }) });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  dom.window.eval(bundle);
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
  receive({ type: 'updateState', snapshot: snapshot() });
  element('#side-list').focus();
});
afterEach(() => dom.window.close());

describe('dashboard DOM', () => {
  it('keeps selection, detail tab and host target aligned through filtering and deletion', () => {
    element('[data-tab="2"]').click();
    element('[data-id="beta"]').click();
    expect(element('[data-tab="2"]').getAttribute('aria-selected')).toBe('true');
    receive({ type: 'updateState', snapshot: snapshot(['alpha']) });
    expect(lastSelection()).toMatchObject({ itemId: 'alpha' });
    expect(element('.side-item.selected').dataset.id).toBe('alpha');
    key('/');
    const input = element('#filter-input') as HTMLInputElement;
    input.value = 'no-match';
    input.dispatchEvent(new dom.window.Event('input'));
    expect(lastSelection()).toMatchObject({ itemId: null });
    expect(element('#side-list').textContent).toContain('No matching items');
    expect(element('#detail-content').textContent).toContain('No item selected');
    expect(dom.window.document.activeElement).toBe(input);
    key('Escape');
    expect(lastSelection()).toMatchObject({ itemId: 'alpha' });
  });

  it('ignores modified/repeated action keys and preserves native Tab and button activation', () => {
    const count = sent.length;
    for (const init of [{ metaKey: true }, { ctrlKey: true }, { altKey: true }, { repeat: true }, { isComposing: true }]) key('r', init);
    expect(sent).toHaveLength(count);
    expect(key('Tab').defaultPrevented).toBe(false);
    expect(key('Tab', { shiftKey: true }).defaultPrevented).toBe(false);
    const button = element('[data-menu-id="alpha"]');
    button.focus();
    expect(key('Enter').defaultPrevented).toBe(false);
    receive({ type: 'updateState', snapshot: snapshot() });
    expect(dom.window.document.activeElement?.getAttribute('data-menu-id')).toBe('alpha');
  });

  it('supports sort clicks and confines confirmation focus to safe controls', () => {
    key('o');
    element('.sort-item[data-idx="1"]').click();
    expect(sent).toContainEqual({ type: 'sortChanged', field: 'name', reversed: false });
    key('d');
    expect(element('#confirm-overlay .message').textContent).toContain('alpha');
    expect(dom.window.document.activeElement).toBe(element('.btn-cancel'));
    element('.btn-confirm').focus();
    const buttons = [...element('#confirm-overlay').querySelectorAll<HTMLButtonElement>('button')];
    buttons.at(-1)!.focus();
    expect(key('Tab').defaultPrevented).toBe(true);
    expect(dom.window.document.activeElement).toBe(buttons[0]);
    buttons[0].focus();
    key('Tab', { shiftKey: true });
    expect(dom.window.document.activeElement).toBe(buttons.at(-1));
    key('Escape');
    expect(element('#confirm-overlay').classList.contains('visible')).toBe(false);
    expect(sent.some(m => m.type === 'action')).toBe(false);
  });

  it('updates a pinned log pane even when the primary is quiet', () => {
    element('[data-pin-id="beta"]').click();
    receive({ type: 'updateLogs', containerId: 'beta', entries: [{ timestamp: null, stream: 'stdout', message: 'secondary only' }] });
    expect(element('[data-compare="secondary"]').textContent).toContain('secondary only');
  });

  it('updates Patterns as selected logs arrive while preserving focus and scroll', () => {
    element('[data-tab="6"]').click();
    receive({ type: 'streamState', update: { kind: 'logs', itemId: 'alpha', state: 'live' } });
    const detail = element('#detail-content');
    detail.focus();
    detail.scrollTop = 64;
    const entry = { timestamp: null, stream: 'stdout' as const, message: 'GET /api/orders 200' };

    receive({ type: 'updateLogs', containerId: 'alpha', entries: [entry] });
    expect(element('.pattern-count').textContent).toBe('1');
    receive({ type: 'updateLogs', containerId: 'alpha', entries: [entry, entry] });
    expect(element('.pattern-count').textContent).toBe('2');
    expect(detail.scrollTop).toBe(64);
    expect(dom.window.document.activeElement).toBe(detail);

    const patterns = element('.patterns-list');
    receive({ type: 'updateLogs', containerId: 'beta', entries: [entry] });
    expect(element('.patterns-list')).toBe(patterns);
    expect(element('.pattern-count').textContent).toBe('2');
  });

  it('restores each panel’s comparison pin when switching panels', () => {
    element('[data-pin-id="beta"]').click();
    element('[data-panel="1"]').click();
    expect(sent.filter(m => m.type === 'toggleCompareItem').at(-1)).toEqual({ type: 'toggleCompareItem', panelId: 'services', itemId: null });
    element('[data-panel="0"]').click();
    expect(sent.filter(m => m.type === 'toggleCompareItem').at(-1)).toEqual({ type: 'toggleCompareItem', panelId: 'containers', itemId: 'beta' });
  });

  it('renders actionable detail and stream errors', () => {
    element('[data-tab="2"]').click();
    receive({ type: 'detailLoad', update: { kind: 'inspect', itemId: 'alpha', state: 'error', message: 'Access denied' } });
    expect(element('#detail-content').textContent).toContain('Access denied');
    element('[data-retry-detail]').click();
    expect(sent.at(-1)).toEqual({ type: 'retryDetail', kind: 'inspect', itemId: 'alpha' });
    receive({ type: 'updateInspect', containerId: 'alpha', details: { env: ['FOO=bar'], restartPolicy: { name: 'always', maximumRetryCount: 0 }, restartCount: 0, mounts: [], exitCode: 0, oomKilled: false, error: '', health: null } });
    receive({ type: 'detailLoad', update: { kind: 'inspect', itemId: 'alpha', state: 'ready' } });
    expect(element('#detail-content').textContent).toContain('FOO');
    element('[data-tab="0"]').click();
    receive({ type: 'streamState', update: { kind: 'logs', itemId: 'alpha', state: 'error', message: 'Disconnected' } });
    element('[data-retry-streams]').click();
    expect(sent.at(-1)).toEqual({ type: 'retryStreams' });
  });

  it('keeps an "Open in Dashboard" target selected until a fresh snapshot settles it', () => {
    receive({ type: 'focusContainer', containerId: 'gamma' });
    expect(lastSelection()).toMatchObject({ itemId: 'gamma' });
    receive({ type: 'connectionState', state: 'connected' });
    expect(lastSelection()).toMatchObject({ itemId: 'gamma' });
    receive({ type: 'updateState', snapshot: snapshot(['alpha', 'beta', 'gamma']) });
    expect(lastSelection()).toMatchObject({ itemId: 'gamma' });
    expect(element('.side-item.selected').dataset.id).toBe('gamma');
  });

  it('falls back to reconciling when the fresh snapshot lacks the target', () => {
    receive({ type: 'focusContainer', containerId: 'ghost' });
    receive({ type: 'updateState', snapshot: snapshot() });
    expect(lastSelection()).toMatchObject({ itemId: 'alpha' });
    expect(element('.side-item.selected').dataset.id).toBe('alpha');
  });

  it('applies log updates in place, keeping lines, the filter input and background refreshes cheap', () => {
    const line = (n: number) => ({ timestamp: null, stream: 'stdout' as const, message: `line ${n}` });
    const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => line(from + i));
    receive({ type: 'updateLogs', containerId: 'alpha', entries: range(0, 3) });
    const input = element('#log-filter-input');
    const first = element('[data-log-content] .log-line');

    receive({ type: 'updateState', snapshot: snapshot() }); // background refresh: nothing rebuilt
    receive({ type: 'updateLogs', containerId: 'alpha', entries: range(0, 5) }); // appended
    expect(element('#log-filter-input')).toBe(input);
    expect(element('[data-log-content] .log-line')).toBe(first);
    expect(element('[data-log-content]').children).toHaveLength(5);

    // A full ring buffer drops lines from the front as it appends.
    const third = element('[data-log-content]').children[2];
    receive({ type: 'updateLogs', containerId: 'alpha', entries: range(2, 7) });
    const lines = [...element('[data-log-content]').children];
    expect(lines[0]).toBe(third);
    expect(lines.map(l => l.textContent)).toEqual(['line 2', 'line 3', 'line 4', 'line 5', 'line 6']);

    // Filtered panes patch too, and keep the match count right.
    (input as HTMLInputElement).value = 'line 6';
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    expect(element('[data-log-match-count]').textContent).toBe('1 matches');
    const match = element('[data-log-content] .log-line');
    receive({ type: 'updateLogs', containerId: 'alpha', entries: [...range(3, 7), { timestamp: null, stream: 'stdout', message: 'line 6 again' }] });
    expect(element('[data-log-content] .log-line')).toBe(match);
    expect(element('[data-log-match-count]').textContent).toBe('2 matches');
  });

  it('gives Services logs their own filter bar, indents services, and copies what is shown', () => {
    receive({ type: 'updateState', snapshot: { ...snapshot(), composeProjects: [{ name: 'shop', status: 'partial', services: [{ name: 'web', projectName: 'shop', state: 'running', image: 'nginx', ports: [] }] }] } });
    element('[data-panel="1"]').click();
    expect(element('[data-id="service:shop:web"]').classList.contains('indented')).toBe(true);
    element('[data-tab="1"]').click();
    receive({ type: 'updateComposeLogs', projectName: 'shop', serviceName: null, entries: [
      { timestamp: null, stream: 'stdout', message: 'GET /a' },
      { timestamp: null, stream: 'stdout', message: 'POST /b' },
    ] });
    const input = element('#log-filter-input') as HTMLInputElement;
    input.value = 'POST';
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    expect(element('[data-log-content]').textContent).toBe('POST /b');
    element('#copy-logs-btn').click();
    expect(sent.at(-1)).toEqual({ type: 'copyLogs', text: 'POST /b' });
  });

  it('only applies the log filter to Copy Logs where its bar is on screen', () => {
    receive({ type: 'updateLogs', containerId: 'alpha', entries: [{ timestamp: null, stream: 'stdout', message: 'a' }, { timestamp: null, stream: 'stdout', message: 'b' }] });
    const input = element('#log-filter-input') as HTMLInputElement;
    input.value = 'b';
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    element('[data-tab="3"]').click();
    element('#side-list').focus();
    key('c');
    expect(sent.at(-1)).toEqual({ type: 'copyLogs', text: 'a\nb' });
  });

  it('describes the confirm dialog by its message', () => {
    key('d');
    const dialog = element('[role="alertdialog"]');
    const message = dom.window.document.getElementById(dialog.getAttribute('aria-describedby') ?? '');
    expect(message?.textContent).toContain('alpha');
  });

  it('starts another item at the top of the detail pane', () => {
    element('[data-tab="3"]').click();
    const detail = element('#detail-content');
    detail.scrollTop = 64;
    element('[data-id="beta"]').click();
    expect(detail.scrollTop).toBe(0);
  });

  it('moves into the details with l or the right arrow, and back with h', () => {
    key('l');
    expect(dom.window.document.activeElement).toBe(element('#detail-content'));
    key('h');
    expect(dom.window.document.activeElement).toBe(element('#side-list'));
    key('ArrowRight');
    expect(dom.window.document.activeElement).toBe(element('#detail-content'));
  });

  it('offers no compose actions in an untrusted workspace', () => {
    const composeProjects = [{ name: 'shop', status: 'running' as const, services: [] }];
    receive({ type: 'updateState', snapshot: { ...snapshot(), composeProjects, composeAllowed: false } });
    element('[data-panel="1"]').click();
    key('u');
    expect(sent.some(m => m.type === 'action')).toBe(false);
    expect(element('#detail-content').textContent).toContain('trusted');
    receive({ type: 'updateState', snapshot: { ...snapshot(), composeProjects } });
    key('u');
    expect(sent.at(-1)).toEqual({ type: 'action', actionType: 'up', itemId: 'project:shop', panelId: 'services' });
  });

  it('makes the stale list inert behind the disconnected banner, without repeating its reason as a toast', () => {
    receive({ type: 'connectionState', state: 'disconnected', reason: 'Docker socket not found' });
    expect(element('#main-area').hasAttribute('inert')).toBe(true);
    expect(dom.window.document.activeElement).toBe(element('#retry-connect'));
    key('d');
    expect(element('#confirm-overlay').classList.contains('visible')).toBe(false);
    receive({ type: 'toast', message: 'Docker socket not found', severity: 'error' });
    expect(element('#toast-container').children).toHaveLength(0);
    receive({ type: 'connectionState', state: 'connected' });
    expect(element('#main-area').hasAttribute('inert')).toBe(false);
    // Focus comes back from the hidden Retry button to the list.
    expect(dom.window.document.activeElement).toBe(element('#side-list'));
  });

  it('shows a repeated error once and copies it as plain text', () => {
    receive({ type: 'toast', message: 'boom', severity: 'error' });
    receive({ type: 'toast', message: 'boom', severity: 'error' });
    receive({ type: 'toast', message: 'other', severity: 'info' });
    expect(element('#toast-container').querySelectorAll('.toast')).toHaveLength(2);
    element('[data-toast-copy]').click();
    expect(sent.at(-1)).toEqual({ type: 'copyText', text: 'boom' });
  });

  it('returns from the actions menu to the ⋯ button that opened it', () => {
    const button = element('[data-menu-id="alpha"]');
    expect(button.getAttribute('aria-haspopup')).toBe('menu');
    button.focus();
    button.click();
    expect(element('#context-menu').classList.contains('visible')).toBe(true);
    expect(element('[data-menu-id="alpha"]').getAttribute('aria-expanded')).toBe('true');
    key('Escape');
    expect(dom.window.document.activeElement?.getAttribute('data-menu-id')).toBe('alpha');
    expect(element('[data-menu-id="alpha"]').getAttribute('aria-expanded')).toBe('false');
  });

  it('opens the sort menu on the field in effect', () => {
    key('o');
    key('j');
    expect(element('.sort-item.selected').dataset.idx).toBe('1');
    key('Escape');
    key('o');
    expect(element('.sort-item.selected').dataset.idx).toBe('0');
  });

  it('re-reads filesystem changes whenever the Files tab shows a container, and says when they were read', () => {
    element('[data-tab="5"]').click();
    expect(sent.at(-1)).toEqual({ type: 'retryDetail', kind: 'changes', itemId: 'alpha' });
    // Selecting another container on the tab would otherwise replay the host's cache.
    element('[data-id="beta"]').click();
    expect(sent.slice(-2)).toEqual([
      { type: 'selectItem', panelId: 'containers', itemId: 'beta' },
      { type: 'retryDetail', kind: 'changes', itemId: 'beta' },
    ]);
    // The host's fetch time is shown, not the time the reply arrived.
    const fetchedAt = '2026-01-01T10:00:00.000Z';
    const asOf = new Date(fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    receive({ type: 'updateChanges', containerId: 'beta', changes: [{ path: '/tmp/x', kind: 'added' }], fetchedAt });
    expect(element('#detail-content').textContent).toContain(`as of ${asOf}`);
  });

  it('scrolls the selected row into view after a sort change, not on a background refresh', () => {
    let scrolls = 0;
    dom.window.HTMLElement.prototype.scrollIntoView = function (this: HTMLElement) { if (this.classList.contains('side-item')) scrolls++; };
    receive({ type: 'updateState', snapshot: { ...snapshot(), containers: snapshot().containers.map(c => ({ ...c, status: 'Up 2 minutes' })) } });
    expect(scrolls).toBe(0);
    key('R');
    expect(scrolls).toBe(1);
  });

  it('does not rebuild the tab bar when the phrase rotates', () => {
    receive({ type: 'phraseBank', phrases: ['one', 'two', 'three'] });
    const tab = element('[data-panel="0"]');
    key('z'); // every keydown rotates the phrase
    expect(element('#tab-bar .phrase').textContent).not.toBe('one');
    receive({ type: 'updateState', snapshot: snapshot() });
    expect(element('[data-panel="0"]')).toBe(tab);
  });

  it('leaves F5 to the host keybinding and keeps the status-bar buttons out of the ellipsized hints', () => {
    const count = sent.length;
    key('F5');
    expect(sent).toHaveLength(count);
    expect(element('.hints').querySelector('.hint-chip')).toBeNull();
    expect(element('.hint-chips [data-hint-action="refresh"]')).toBeTruthy();
  });
});

