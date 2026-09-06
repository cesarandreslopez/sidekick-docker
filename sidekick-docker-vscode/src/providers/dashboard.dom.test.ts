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
    receive({ type: 'detailLoad', update: { kind: 'env', itemId: 'alpha', state: 'error', message: 'Access denied' } });
    expect(element('#detail-content').textContent).toContain('Access denied');
    element('[data-retry-detail]').click();
    expect(sent.at(-1)).toEqual({ type: 'retryDetail', kind: 'env', itemId: 'alpha' });
    receive({ type: 'updateEnv', containerId: 'alpha', env: ['FOO=bar'] });
    receive({ type: 'detailLoad', update: { kind: 'env', itemId: 'alpha', state: 'ready' } });
    expect(element('#detail-content').textContent).toContain('FOO');
    element('[data-tab="0"]').click();
    receive({ type: 'streamState', update: { kind: 'logs', itemId: 'alpha', state: 'error', message: 'Disconnected' } });
    element('[data-retry-streams]').click();
    expect(sent.at(-1)).toEqual({ type: 'retryStreams' });
  });
});
