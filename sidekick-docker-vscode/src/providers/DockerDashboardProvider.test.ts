import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type * as vscode from 'vscode';
import { DockerDashboardProvider } from './DockerDashboardProvider';

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

    initialize(): Promise<boolean> {
      return this.initResult;
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
});
