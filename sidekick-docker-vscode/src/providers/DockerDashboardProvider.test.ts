import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type * as vscode from 'vscode';
import { DockerDashboardProvider } from './DockerDashboardProvider';
import { CONTAINER_FILES_TAB_INDEX } from '../types/detailTabs';

interface MockService {
  disposed: boolean;
  resolveInitialize: (ok: boolean) => void;
  forceRefresh: ReturnType<typeof vi.fn>;
}

const { serviceInstances } = vi.hoisted(() => ({
  serviceInstances: [] as MockService[],
}));

vi.mock('../services/DockerService', () => {
  class MockDockerService {
    disposed = false;
    resolveInitialize!: (ok: boolean) => void;
    private readonly initResult = new Promise<boolean>((resolve) => {
      this.resolveInitialize = resolve;
    });
    forceRefresh = vi.fn(async () => { /* noop */ });

    constructor() {
      serviceInstances.push(this as unknown as MockService);
    }

    initialize(): Promise<{ ok: true } | { ok: false; reason: string }> {
      return this.initResult.then(ok => (ok ? { ok: true as const } : { ok: false as const, reason: 'Permission denied on /var/run/docker.sock.' }));
    }

    dispose(): void {
      this.disposed = true;
    }

    getStateSnapshot(): unknown {
      return {};
    }

    setViewState(): void { /* noop */ }
    async setVisible(): Promise<void> { /* noop */ }
    async selectContainer(): Promise<void> { /* noop */ }
    async selectImage(): Promise<void> { /* noop */ }
  }
  return { DockerService: MockDockerService };
});

/** Access the provider's private members under test. */
interface ProviderInternals {
  _initializeService(): Promise<void>;
  _handleMessage(message: { type: string }): Promise<void>;
  _cleanup(): void;
  service: unknown;
}

function internals(provider: DockerDashboardProvider): ProviderInternals {
  return provider as unknown as ProviderInternals;
}

/** Flush pending microtasks + timers so in-flight awaits progress. */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('DockerDashboardProvider._initializeService single-flight', () => {
  let provider: DockerDashboardProvider;

  beforeEach(() => {
    serviceInstances.length = 0;
    provider = new DockerDashboardProvider({} as vscode.Uri);
  });

  afterEach(() => {
    provider.dispose();
  });

  it('keeps exactly one live service when two inits overlap', async () => {
    const p = internals(provider);

    const runA = p._initializeService();
    await tick(); // A created its service, now awaiting initialize()
    expect(serviceInstances).toHaveLength(1);

    const runB = p._initializeService();
    await tick(); // B created its service, now awaiting initialize()
    expect(serviceInstances).toHaveLength(2);

    serviceInstances[0].resolveInitialize(true);
    serviceInstances[1].resolveInitialize(true);
    await Promise.all([runA, runB]); // must not throw

    expect(serviceInstances[0].disposed).toBe(true);
    expect(serviceInstances[1].disposed).toBe(false);
    expect(p.service).toBe(serviceInstances[1]);
  });

  it('does not let a superseded failed init dispose the newer run\'s service', async () => {
    const p = internals(provider);

    const runA = p._initializeService();
    await tick();
    const runB = p._initializeService();
    await tick();

    // A is stale and its connect failed: it must dispose only its own
    // service and must not touch this.service or throw.
    serviceInstances[0].resolveInitialize(false);
    await runA;
    expect(serviceInstances[0].disposed).toBe(true);
    expect(serviceInstances[1].disposed).toBe(false);

    serviceInstances[1].resolveInitialize(true);
    await runB; // previously TypeError: dispose of undefined
    expect(p.service).toBe(serviceInstances[1]);
  });

  it('disposes an in-flight service when the panel is cleaned up mid-init', async () => {
    const p = internals(provider);

    const run = p._initializeService();
    await tick();
    expect(serviceInstances).toHaveLength(1);

    p._cleanup(); // panel closed while initialize() is still pending
    serviceInstances[0].resolveInitialize(true);
    await run;

    expect(serviceInstances[0].disposed).toBe(true);
    expect(p.service).toBeUndefined();
  });
});

describe('DockerDashboardProvider requestRefresh', () => {
  let provider: DockerDashboardProvider;

  beforeEach(() => {
    serviceInstances.length = 0;
    provider = new DockerDashboardProvider({} as vscode.Uri);
  });

  afterEach(() => {
    provider.dispose();
  });

  it('re-initializes instead of no-oping when no service is live (failed connect + F5)', async () => {
    const p = internals(provider);

    const handled = p._handleMessage({ type: 'requestRefresh' });
    await tick();
    expect(serviceInstances).toHaveLength(1);

    serviceInstances[0].resolveInitialize(true);
    await handled;
    expect(p.service).toBe(serviceInstances[0]);
  });

  it('refreshes the live service without re-initializing', async () => {
    const p = internals(provider);

    const run = p._initializeService();
    await tick();
    serviceInstances[0].resolveInitialize(true);
    await run;

    await p._handleMessage({ type: 'requestRefresh' });

    expect(serviceInstances).toHaveLength(1);
    expect(serviceInstances[0].forceRefresh).toHaveBeenCalledTimes(1);
  });

  it('passes the real reason for a failed connect to the webview', async () => {
    const p = internals(provider);
    const posted: unknown[] = [];
    (p as unknown as { _postMessage(m: unknown): void })._postMessage = (m: unknown) => { posted.push(m); };

    const run = p._initializeService();
    await tick();
    serviceInstances[0].resolveInitialize(false);
    await run;

    expect(posted).toContainEqual({ type: 'connectionState', state: 'disconnected', reason: 'Permission denied on /var/run/docker.sock.' });
    expect(posted).toContainEqual({ type: 'toast', message: 'Permission denied on /var/run/docker.sock.', severity: 'error' });
  });

  it('opens a published port through asExternalUri, asking which when there are several', async () => {
    const { __mock } = await import('../test/vscode');
    __mock.reset();
    const p = internals(provider);
    const run = p._initializeService();
    await tick();
    serviceInstances[0].resolveInitialize(true);
    await run;
    const port = (hostPort: number, containerPort: number) => ({ hostIp: '0.0.0.0', hostPort, containerPort, protocol: 'tcp' });
    (serviceInstances[0] as unknown as { getStateSnapshot(): unknown }).getStateSnapshot = () => ({
      containers: [
        { id: 'one', name: 'web', ports: [port(8080, 80), port(8080, 80)] },
        { id: 'two', name: 'app', ports: [port(3000, 3000), port(8443, 443)] },
      ],
    });
    const handle = (p as unknown as { _handleAction(a: string, i: string, panel: string): Promise<void> })._handleAction.bind(p);

    await handle('openPort', 'one', 'containers');
    expect(__mock.openedExternal).toEqual(['http://localhost:8080']);

    __mock.quickPickResult = 'https://localhost:8443';
    await handle('openPort', 'two', 'containers');
    expect(__mock.openedExternal.at(-1)).toBe('https://localhost:8443');
  });
});

describe('DockerDashboardProvider feedback', () => {
  let provider: DockerDashboardProvider;
  let posted: unknown[];

  beforeEach(async () => {
    const { __mock } = await import('../test/vscode');
    __mock.reset();
    serviceInstances.length = 0;
    provider = new DockerDashboardProvider({} as vscode.Uri);
    posted = [];
    (provider as unknown as { _postMessage(m: unknown): void })._postMessage = (m: unknown) => { posted.push(m); };
    const p = internals(provider);
    const run = p._initializeService();
    await tick();
    serviceInstances[0].resolveInitialize(true);
    await run;
    posted.length = 0;
  });

  afterEach(() => {
    provider.dispose();
  });

  const handle = (a: string, i: string, panel: string) =>
    (provider as unknown as { _handleAction(a: string, i: string, panel: string): Promise<void> })._handleAction(a, i, panel);

  it('copies a toast with copyText and says "Copied", not "Logs copied"', async () => {
    const { __mock } = await import('../test/vscode');
    await internals(provider)._handleMessage({ type: 'copyText', text: 'boom' } as { type: string });
    expect(__mock.clipboard).toEqual(['boom']);
    expect(posted).toContainEqual({ type: 'toast', message: 'Copied to clipboard', severity: 'info' });
  });

  it('names the project, not the service row, for compose Up and Down', async () => {
    const svc = serviceInstances[0] as unknown as Record<string, unknown>;
    svc.getItemDisplayName = () => 'shop/web';
    svc.composeUp = vi.fn(async () => { /* ok */ });
    svc.composeDown = vi.fn(async () => { throw new Error('no such project'); });
    await handle('up', 'service:shop:web', 'services');
    expect(posted).toContainEqual({ type: 'toast', message: 'shop is up', severity: 'success' });
    await handle('down', 'service:shop:web', 'services');
    expect(posted).toContainEqual({ type: 'toast', message: 'Failed to take shop down: no such project', severity: 'error' });
  });

  it('words failures with the shared actionFailedText', async () => {
    const svc = serviceInstances[0] as unknown as Record<string, unknown>;
    svc.getItemDisplayName = () => 'web';
    svc.stopContainer = vi.fn(async () => { throw new Error('is not running'); });
    await handle('stop', 'abc', 'containers');
    expect(posted).toContainEqual({ type: 'toast', message: 'Failed to stop web: is not running', severity: 'error' });
  });

  it('re-reads filesystem changes on refresh while the Files tab is showing', async () => {
    const svc = serviceInstances[0] as unknown as Record<string, unknown>;
    const loadDetail = vi.fn(async () => { /* ok */ });
    svc.loadDetail = loadDetail;
    const p = internals(provider);
    await p._handleMessage({ type: 'selectItem', panelId: 'containers', itemId: 'abc' } as { type: string });
    await p._handleMessage({ type: 'switchDetailTab', tabIndex: 1 } as { type: string });
    await p._handleMessage({ type: 'requestRefresh' });
    expect(loadDetail).not.toHaveBeenCalled();
    await p._handleMessage({ type: 'switchDetailTab', tabIndex: CONTAINER_FILES_TAB_INDEX } as { type: string });
    await p._handleMessage({ type: 'requestRefresh' });
    expect(loadDetail).toHaveBeenCalledWith('changes', 'abc', true);
  });

  it('refreshes once from the F5 keybinding, with a toast', async () => {
    (provider as unknown as { panel: unknown }).panel = {};
    await provider.refreshFromKeybinding();
    expect(serviceInstances[0].forceRefresh).toHaveBeenCalledTimes(1);
    expect(posted).toEqual([{ type: 'toast', message: 'Refreshing\u2026', severity: 'info' }]);
    (provider as unknown as { panel: unknown }).panel = undefined;
  });
});

