import type { DockerClient, ResourceListing } from '../docker/DockerClient';
import { ComposeDetector } from '../compose/ComposeDetector';
import { ComposeFileReader } from '../compose/ComposeFileReader';
import type { ComposeFileConfig } from '../compose/ComposeFileReader';
import { CachedComposeFileReader } from '../compose/ComposeConfigCache';
import type { ComposeConfigSource } from '../compose/ComposeConfigCache';
import type { ContainerInfo } from '../types/container';
import type { ImageInfo } from '../types/image';
import type { VolumeInfo } from '../types/volume';
import type { NetworkInfo } from '../types/network';
import type { ComposeProject } from '../types/compose';
import type { DockerEvent } from '../types/events';
import { applyEffect, classifyEvent } from './eventPolicy';
import type { EventEffect, ResourceKind } from './eventPolicy';

/** Everything both dashboards render from. Arrays are replaced, never mutated. */
export interface DockerStateSnapshot {
  containers: ContainerInfo[];
  images: ImageInfo[];
  volumes: VolumeInfo[];
  networks: NetworkInfo[];
  composeProjects: ComposeProject[];
  composeFileConfig: ComposeFileConfig | null;
  daemonConnected: boolean;
  lastRefresh: Date | null;
  /** Why a resource list could not be refreshed this pass, keyed by kind. */
  resourceErrors: Partial<Record<ResourceKind, string>>;
}

export type StoreChange =
  | { cause: 'refresh'; removedContainerIds: string[]; removedImageIds: string[] }
  | { cause: 'event'; event: DockerEvent; removedContainerIds: string[] };

export interface DockerStateStoreOptions {
  client: DockerClient;
  /** Directory to read the compose file from. Undefined → no compose file config. */
  cwd?: string;
  composeReader?: ComposeConfigSource;
  /** Endpoint overrides for the default compose reader (see `dockerCliEnv`). */
  cliEnv?: Record<string, string>;
  /** Which lists to fetch. Containers are always fetched. Default: everything. */
  include?: { images?: boolean; volumes?: boolean; networks?: boolean; compose?: boolean };
  /** Coalescing window for event-triggered refreshes. Default 500ms. */
  eventDebounceMs?: number;
  /** A pass that takes longer is abandoned, keeping the previous data. Default 20s. */
  refreshTimeoutMs?: number;
  /**
   * Fires after an event only when it changed the snapshot, but after every
   * refresh pass — committed or abandoned at the deadline — changed or not.
   */
  onChange?: (change: StoreChange) => void;
  log?: (message: string, error?: unknown) => void;
}

const EMPTY: DockerStateSnapshot = {
  containers: [], images: [], volumes: [], networks: [], composeProjects: [],
  composeFileConfig: null, daemonConnected: false, lastRefresh: null, resourceErrors: {},
};

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Domain state for one Docker endpoint, shared by the TUI and VS Code.
 *
 * Passive by design: it owns no event stream and no polling interval —
 * callers feed it events (`processEvent`) and ask it to `refresh()`. What it
 * owns is the policy both dashboards used to duplicate (and had let drift):
 *
 * - A refresh pass **always commits**. Events that arrive mid-fetch are
 *   journalled and replayed over the fetched lists, so a stale listing can't
 *   resurrect a destroyed container — and a steady stream of events can no
 *   longer starve refreshes forever, which discarding results did.
 * - Event-triggered refreshes are debounced; events that don't change what is
 *   shown (healthcheck `exec_*`, volume `mount`…) do nothing at all.
 * - A pass that outlives `refreshTimeoutMs` is abandoned with an error per
 *   resource and the previous data kept, so one hung call can't freeze the
 *   dashboard.
 * - Concurrent `refresh()` calls share one follow-up pass.
 */
export class DockerStateStore {
  private readonly client: DockerClient;
  private readonly cwd: string | undefined;
  private readonly composeReader: ComposeConfigSource | null;
  private readonly detector = new ComposeDetector();
  private readonly include: Required<NonNullable<DockerStateStoreOptions['include']>>;
  private readonly debounceMs: number;
  private readonly timeoutMs: number;
  private readonly onChange?: (change: StoreChange) => void;
  private readonly log?: (message: string, error?: unknown) => void;

  private snapshot: DockerStateSnapshot = EMPTY;
  private pass: Promise<void> | null = null;
  private passAbort: AbortController | null = null;
  private waiters: { promise: Promise<void>; resolve: () => void } | null = null;
  private journal: EventEffect[] | null = null;
  private dirty = false;
  private forceCompose = false;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(opts: DockerStateStoreOptions) {
    this.client = opts.client;
    this.include = {
      images: opts.include?.images ?? true,
      volumes: opts.include?.volumes ?? true,
      networks: opts.include?.networks ?? true,
      compose: opts.include?.compose ?? true,
    };
    this.cwd = this.include.compose ? opts.cwd : undefined;
    this.composeReader = this.cwd === undefined ? null
      : opts.composeReader ?? new CachedComposeFileReader(new ComposeFileReader(opts.cliEnv));
    this.debounceMs = opts.eventDebounceMs ?? 500;
    this.timeoutMs = opts.refreshTimeoutMs ?? 20_000;
    this.onChange = opts.onChange;
    this.log = opts.log;
  }

  getSnapshot(): DockerStateSnapshot {
    return this.snapshot;
  }

  /** `undefined` when the id is unknown. */
  isContainerRunning(id: string): boolean | undefined {
    const c = this.snapshot.containers.find(x => x.id === id);
    return c ? c.state === 'running' : undefined;
  }

  /** Whether any container of the project (or of one service) is running; `undefined` when unknown. */
  isComposeTargetRunning(project: string, service: string | null): boolean | undefined {
    const members = this.snapshot.containers.filter(c =>
      c.composeProject === project && (service === null || c.composeService === service));
    if (members.length === 0) {
      return this.snapshot.composeProjects.some(p => p.name === project) ? false : undefined;
    }
    return members.some(c => c.state === 'running');
  }

  getRunningContainerIds(): string[] {
    return this.snapshot.containers.filter(c => c.state === 'running').map(c => c.id);
  }

  /**
   * Fetch everything now. Resolves once a pass that started after this call
   * has committed (or been abandoned); never rejects.
   * @param opts.reloadCompose re-read the compose file even if it looks unchanged.
   */
  refresh(opts: { reloadCompose?: boolean } = {}): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (opts.reloadCompose) this.forceCompose = true;
    this.clearDebounce();
    if (!this.pass) return this.startPass();
    if (!this.waiters) {
      let resolve!: () => void;
      const promise = new Promise<void>(r => { resolve = r; });
      this.waiters = { promise, resolve };
    }
    return this.waiters.promise;
  }

  /** Schedule a debounced refresh (coalesces bursts of events). */
  requestRefresh(): void {
    if (this.disposed) return;
    if (this.pass) { this.dirty = true; return; }
    if (this.debounceTimer) return;
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.refresh();
    }, this.debounceMs);
  }

  processEvent(event: DockerEvent): void {
    if (this.disposed) return;
    const effect = classifyEvent(event);
    if (effect.kind === 'ignore') return;
    if (effect.kind === 'refresh') {
      if (effect.resources.some(r => this.wants(r))) this.requestRefresh();
      return;
    }

    if (this.journal) this.journal.push(effect);
    const before = this.snapshot.containers;
    const after = applyEffect(before, effect);
    if (after !== before) {
      this.snapshot = {
        ...this.snapshot,
        containers: after,
        composeProjects: this.detector.detect(after, this.snapshot.composeFileConfig),
      };
      this.onChange?.({ cause: 'event', event, removedContainerIds: effect.kind === 'remove' ? [effect.containerId] : [] });
    }
    if (effect.kind === 'patch' && effect.refresh.some(r => this.wants(r))) this.requestRefresh();
  }

  dispose(): void {
    this.disposed = true;
    this.clearDebounce();
    this.passAbort?.abort();
    this.waiters?.resolve();
    this.waiters = null;
  }

  private wants(kind: ResourceKind): boolean {
    switch (kind) {
      case 'containers': return true;
      case 'images': return this.include.images;
      case 'volumes': return this.include.volumes;
      case 'networks': return this.include.networks;
      case 'services': return this.composeReader !== null;
    }
  }

  private clearDebounce(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  private startPass(): Promise<void> {
    const pass = this.runPass()
      .catch((err: unknown) => { this.log?.('refresh failed', err); })
      .finally(() => {
        this.pass = null;
        if (this.disposed) return;
        const waiters = this.waiters;
        this.waiters = null;
        if (waiters) {
          void this.startPass().then(waiters.resolve);
        } else if (this.dirty) {
          this.dirty = false;
          this.requestRefresh();
        }
      });
    this.pass = pass;
    return pass;
  }

  private async runPass(): Promise<void> {
    const controller = new AbortController();
    this.passAbort = controller;
    this.journal = [];
    this.dirty = false;
    const force = this.forceCompose;
    this.forceCompose = false;
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    const timedOut = new Promise<'timeout'>(resolve => {
      controller.signal.addEventListener('abort', () => resolve('timeout'), { once: true });
    });
    const work = Promise.all([
      this.client.listResources({ ...this.include, signal: controller.signal }),
      this.readCompose(controller.signal, force),
    ]);
    let result: Awaited<typeof work> | 'timeout';
    try {
      result = await Promise.race([work, timedOut]);
    } finally {
      clearTimeout(timer);
      if (this.passAbort === controller) this.passAbort = null;
    }
    const journal = this.journal;
    this.journal = null;
    if (this.disposed) return;

    if (result === 'timeout') {
      work.catch(() => {}); // settles later; nothing left to do with it
      const reason = `Timed out after ${Math.round(this.timeoutMs / 1000)}s`;
      const resourceErrors: DockerStateSnapshot['resourceErrors'] = {};
      for (const kind of ['containers', 'images', 'volumes', 'networks'] as const) {
        if (this.wants(kind)) resourceErrors[kind] = reason;
      }
      this.snapshot = { ...this.snapshot, resourceErrors };
      this.log?.(`refresh ${reason.toLowerCase()}`);
      this.onChange?.({ cause: 'refresh', removedContainerIds: [], removedImageIds: [] });
      return;
    }

    this.commit(result[0], result[1], journal ?? []);
  }

  private async readCompose(signal: AbortSignal, force: boolean): Promise<PromiseSettledResult<ComposeFileConfig | null> | null> {
    if (!this.composeReader || this.cwd === undefined) return null;
    try {
      return { status: 'fulfilled', value: await this.composeReader.read(this.cwd, { signal, force }) };
    } catch (reason) {
      return { status: 'rejected', reason };
    }
  }

  private commit(listing: ResourceListing, compose: PromiseSettledResult<ComposeFileConfig | null> | null, journal: EventEffect[]): void {
    const prev = this.snapshot;
    const resourceErrors: DockerStateSnapshot['resourceErrors'] = {};
    const take = <T>(kind: ResourceKind, r: PromiseSettledResult<T> | undefined | null, fallback: T): T => {
      if (!r) return fallback;
      if (r.status === 'rejected') {
        resourceErrors[kind] = message(r.reason);
        return fallback;
      }
      return r.value;
    };

    let containers = take('containers', listing.containers, prev.containers);
    const images = take('images', listing.images, prev.images);
    const volumes = take('volumes', listing.volumes, prev.volumes);
    const networks = take('networks', listing.networks, prev.networks);
    const composeFileConfig = take('services', compose, this.cwd === undefined ? null : prev.composeFileConfig);

    for (const effect of journal) containers = applyEffect(containers, effect);

    const daemonConnected = [listing.containers, listing.images, listing.volumes, listing.networks]
      .some(r => r?.status === 'fulfilled');
    const containerIds = new Set(containers.map(c => c.id));
    const imageIds = new Set(images.map(i => i.id));

    this.snapshot = {
      containers,
      images,
      volumes,
      networks,
      composeFileConfig,
      composeProjects: this.detector.detect(containers, composeFileConfig),
      daemonConnected,
      lastRefresh: daemonConnected ? new Date() : prev.lastRefresh,
      resourceErrors,
    };
    this.onChange?.({
      cause: 'refresh',
      removedContainerIds: prev.containers.filter(c => !containerIds.has(c.id)).map(c => c.id),
      removedImageIds: prev.images.filter(i => !imageIds.has(i.id)).map(i => i.id),
    });
  }
}
