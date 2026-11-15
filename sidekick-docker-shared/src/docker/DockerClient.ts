import Dockerode from 'dockerode';
import { abortableChunks, LineDecoder, streamLines, streamRequest } from './streams';
import type {
  ContainerInfo,
  ContainerDetails,
  ContainerStats,
  LogEntry,
  PortBinding,
  ImageInfo,
  ImageLayer,
  FilesystemChange,
  VolumeInfo,
  VolumePruneScope,
  NetworkInfo,
  NetworkContainerRef,
  DiskUsage,
  DockerEvent,
  DockerResourceType,
} from '../types';
import {
  DockerStatsRawSchema,
  DockerEventRawSchema,
  ContainerStateSchema,
  PortProtocolSchema,
  VolumeItemRawSchema,
  ContainerNetworkAttachmentRawSchema,
  NetworkIpamConfigRawSchema,
  ImageItemRawSchema,
  PruneImagesResponseSchema,
  PruneVolumesResponseSchema,
  PruneNetworksResponseSchema,
  PruneContainersResponseSchema,
  DiskUsageResponseSchema,
  ContainerInspectDetailsSchema,
  ContainerChangesResponseSchema,
  ImageHistoryResponseSchema,
} from './schemas';
import type { DockerStatsRaw } from './schemas';
import { shortId, realImageTags, UNTAGGED_IMAGE } from './utils';

export interface DockerClientOptions {
  socketPath?: string;
  host?: string;
  port?: number;
  protocol?: 'http' | 'https';
  /**
   * Deadline for non-streaming reads (lists, inspect, ping, history…). Default 30s.
   * Streams are exempt: a quiet log or event stream is not a hung one.
   */
  requestTimeoutMs?: number;
}

export interface ListResourcesOptions {
  images?: boolean;
  volumes?: boolean;
  networks?: boolean;
  signal?: AbortSignal;
}

/** One refresh pass's worth of listings; each settles independently. */
export interface ResourceListing {
  containers: PromiseSettledResult<ContainerInfo[]>;
  images?: PromiseSettledResult<ImageInfo[]>;
  volumes?: PromiseSettledResult<VolumeInfo[]>;
  networks?: PromiseSettledResult<NetworkInfo[]>;
}

/** Raised when a Docker request outlives its deadline. */
export class DockerTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Docker did not respond within ${Math.round(timeoutMs / 1000)}s`);
    this.name = 'DockerTimeoutError';
  }
}

type RawContainer = Dockerode.ContainerInfo;

export type PingResult = { ok: true } | { ok: false; error: unknown };

export interface LogStreamOptions {
  tail?: number;
  since?: number;
  follow?: boolean;
  stdout?: boolean;
  stderr?: boolean;
}

export class DockerClient {
  private docker: Dockerode;
  private readonly requestTimeoutMs: number;
  private apiVersion: Promise<string | null> | undefined;

  constructor(opts?: DockerClientOptions) {
    const { requestTimeoutMs, ...endpoint } = opts ?? {};
    this.requestTimeoutMs = requestTimeoutMs ?? 30_000;
    // docker-modem merges DOCKER_HOST-derived defaults under these options and
    // prefers host over socketPath, so an explicit socketPath would silently
    // lose to an ambient DOCKER_HOST. Explicit undefined keys survive the
    // Object.assign merge and pin the requested socket.
    //
    // docker-modem's own `timeout` option is deliberately not used: it is a
    // socket idle timeout applied to every request, so it would also kill a
    // quiet follow stream. Reads get a per-call deadline instead (request()).
    const pinned = endpoint.socketPath && !endpoint.host
      ? { ...endpoint, host: undefined, port: undefined, protocol: undefined }
      : opts ? endpoint : undefined;
    this.docker = new Dockerode(pinned);
  }

  /**
   * Run one non-streaming call with a deadline. The call receives a signal that
   * aborts at the deadline (or when `signal` does); the race is a backstop for
   * calls that ignore their signal, so a hung daemon can never hang a caller.
   */
  private request<T>(call: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
    const ms = this.requestTimeoutMs;
    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(new DockerTimeoutError(ms)), ms);
    timer.unref?.();
    const combined = signal ? AbortSignal.any([signal, deadline.signal]) : deadline.signal;
    let onAbort: (() => void) | undefined;
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => reject(combined.reason instanceof Error ? combined.reason : new Error('Request aborted'));
      if (combined.aborted) onAbort();
      else combined.addEventListener('abort', onAbort, { once: true });
    });
    return Promise.race([call(combined), aborted]).finally(() => {
      clearTimeout(timer);
      if (onAbort) combined.removeEventListener('abort', onAbort);
    });
  }

  async ping(): Promise<boolean> {
    return (await this.pingDetailed()).ok;
  }

  /** Like ping(), but preserves the underlying error so callers can explain the failure. */
  async pingDetailed(): Promise<PingResult> {
    try {
      // ping, df and changes accept abortSignal at runtime; their typings only declare a callback.
      await this.request(abortSignal => (this.docker.ping as (o: object) => Promise<unknown>).call(this.docker, { abortSignal }));
      return { ok: true };
    } catch (error) {
      return { ok: false, error };
    }
  }

  async listContainers(all = true, signal?: AbortSignal): Promise<ContainerInfo[]> {
    const containers = await this.rawContainers(all, signal);
    return containers.map(toContainerInfo);
  }

  private rawContainers(all: boolean, signal?: AbortSignal): Promise<RawContainer[]> {
    return this.request(abortSignal => this.docker.listContainers({ all, abortSignal }), signal);
  }

  /**
   * Everything one dashboard refresh needs, with a single container listing.
   *
   * listVolumes() and listNetworks() each list containers again to work out
   * mounts and attachments, so a refresh built from the individual calls made
   * three container listings. Here one raw listing feeds all three. When it
   * fails, volumes and networks fail with it rather than report every volume
   * as unused.
   */
  async listResources(opts: ListResourcesOptions = {}): Promise<ResourceListing> {
    const { signal } = opts;
    const raw = this.rawContainers(true, signal);
    const [containers, images, volumes, networks] = await Promise.allSettled([
      raw.then(list => list.map(toContainerInfo)),
      opts.images === false ? Promise.resolve(undefined) : this.listImages(false, signal),
      opts.volumes === false ? Promise.resolve(undefined)
        : Promise.all([this.request(abortSignal => this.docker.listVolumes({ abortSignal }), signal), raw, this.getApiVersion(signal)])
          .then(([res, list, apiVersion]) => buildVolumeInfos(res.Volumes || [], list, volumePruneScope(apiVersion))),
      opts.networks === false ? Promise.resolve(undefined)
        : Promise.all([this.request(abortSignal => this.docker.listNetworks({ abortSignal }), signal), raw])
          .then(([nets, list]) => buildNetworkInfos(nets, list)),
    ]);
    const listing: ResourceListing = { containers };
    if (opts.images !== false) listing.images = images as PromiseSettledResult<ImageInfo[]>;
    if (opts.volumes !== false) listing.volumes = volumes as PromiseSettledResult<VolumeInfo[]>;
    if (opts.networks !== false) listing.networks = networks as PromiseSettledResult<NetworkInfo[]>;
    return listing;
  }

  async startContainer(id: string): Promise<void> {
    await this.docker.getContainer(id).start();
  }

  async stopContainer(id: string): Promise<void> {
    await this.docker.getContainer(id).stop();
  }

  async restartContainer(id: string): Promise<void> {
    await this.docker.getContainer(id).restart();
  }

  async pauseContainer(id: string): Promise<void> {
    await this.docker.getContainer(id).pause();
  }

  async unpauseContainer(id: string): Promise<void> {
    await this.docker.getContainer(id).unpause();
  }

  async removeContainer(id: string, force = false): Promise<void> {
    await this.docker.getContainer(id).remove({ force });
  }

  async inspectContainer(id: string): Promise<Dockerode.ContainerInspectInfo> {
    return this.request(abortSignal => this.docker.getContainer(id).inspect({ abortSignal }));
  }

  async getContainerEnv(id: string): Promise<string[]> {
    return (await this.getContainerDetails(id)).env;
  }

  /** Env, restart policy, mounts, health log and exit status — one inspect call. */
  async getContainerDetails(id: string): Promise<ContainerDetails> {
    const v = ContainerInspectDetailsSchema.parse(await this.inspectContainer(id));
    const health = v.State?.Health;
    return {
      env: v.Config.Env ?? [],
      restartPolicy: {
        name: v.HostConfig?.RestartPolicy?.Name || 'no',
        maximumRetryCount: v.HostConfig?.RestartPolicy?.MaximumRetryCount ?? 0,
      },
      restartCount: v.RestartCount,
      mounts: (v.Mounts ?? []).map(m => ({
        type: m.Type, name: m.Name || undefined, source: m.Source, destination: m.Destination, readOnly: !m.RW,
      })),
      exitCode: v.State?.ExitCode ?? 0,
      oomKilled: v.State?.OOMKilled ?? false,
      error: v.State?.Error ?? '',
      health: health?.Status ? {
        status: health.Status,
        failingStreak: health.FailingStreak,
        // Docker keeps the last 5 probes, oldest first.
        log: (health.Log ?? []).map(l => ({ start: l.Start ? new Date(l.Start) : null, exitCode: l.ExitCode, output: l.Output.trim() })),
      } : null,
    };
  }

  async *streamLogs(id: string, opts: LogStreamOptions = {}, signal?: AbortSignal): AsyncIterable<LogEntry> {
    if (signal?.aborted) return;
    const container = this.docker.getContainer(id);
    const logOpts = {
      follow: true as const,
      stdout: opts.stdout ?? true,
      stderr: opts.stderr ?? true,
      tail: opts.tail ?? 100,
      since: opts.since ?? 0,
      timestamps: true,
      abortSignal: signal,
    };

    const info = opts.follow === false ? undefined
      : await streamRequest(container.inspect({ abortSignal: signal }), signal);
    const isTty = info?.Config.Tty;
    if (signal?.aborted) return;
    const stream = opts.follow === false
      ? await streamRequest(container.logs({ ...logOpts, follow: false as const }), signal)
      : await streamRequest(container.logs(logOpts), signal);
    if (stream === undefined) return;

    if (signal?.aborted) {
      if (typeof stream !== 'string' && !Buffer.isBuffer(stream)) (stream as unknown as { destroy?: () => void }).destroy?.();
      return;
    }
    const buffered = typeof stream === 'string' || Buffer.isBuffer(stream);
    const bytes = buffered ? Buffer.from(stream as string | Buffer) : undefined;
    // Inspect the TTY flag instead of interpreting raw terminal bytes as a frame header.
    const chunks = buffered
      ? (async function* () { yield bytes!; })()
      : abortableChunks(stream as unknown as AsyncIterable<Buffer> & { destroy(): void }, signal);
    try {
      const tty = buffered ? !looksMultiplexed(bytes!) : isTty === true;
      const decoders = { stdout: new LineDecoder(), stderr: new LineDecoder() };
      let pending: Buffer = Buffer.alloc(0);
      for await (const chunk of chunks) {
        if (signal?.aborted) return;
        if (tty) {
          for (const line of decoders.stdout.push(chunk)) {
            if (line) yield parseLogLine(line, 'stdout');
          }
          continue;
        }
        const { frames, rest } = demuxFrames(Buffer.concat([pending, chunk]));
        for (const frame of frames) {
          for (const line of decoders[frame.stream].push(frame.payload)) {
            if (line) yield parseLogLine(line, frame.stream);
          }
        }
        pending = Buffer.from(rest);
      }
      if (!signal?.aborted) {
        for (const channel of ['stdout', 'stderr'] as const) {
          for (const line of decoders[channel].end()) {
            if (line) yield parseLogLine(line, channel);
          }
        }
      }
    } finally {
      if (!buffered) (stream as unknown as { destroy?: () => void }).destroy?.();
    }
  }

  private parseStats(
    validated: DockerStatsRaw,
    prevCpu: number,
    prevSystem: number,
  ): { stats: ContainerStats; cpuTotal: number; systemTotal: number } {
    const cpuStats = validated.cpu_stats;
    const preCpuStats = validated.precpu_stats;
    const memStats = validated.memory_stats;
    const netStats = validated.networks;
    const pidsStats = validated.pids_stats;
    const blkioStats = validated.blkio_stats;

    // CPU calculation
    const cpuUsage = cpuStats?.cpu_usage.total_usage ?? 0;
    const systemUsage = cpuStats?.system_cpu_usage ?? 0;
    const numCpus = cpuStats?.cpu_usage.percpu_usage?.length
      ?? cpuStats?.online_cpus
      ?? 1;

    const cpuDelta = cpuUsage - (prevCpu || (preCpuStats?.cpu_usage.total_usage ?? 0));
    const systemDelta = systemUsage - (prevSystem || (preCpuStats?.system_cpu_usage ?? 0));

    const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * numCpus * 100 : 0;

    // Memory
    const memUsage = memStats?.usage ?? 0;
    const memLimit = memStats?.limit ?? 0;
    const memPercent = memLimit > 0 ? (memUsage / memLimit) * 100 : 0;

    // Network
    let netRx = 0;
    let netTx = 0;
    if (netStats) {
      for (const iface of Object.values(netStats)) {
        netRx += iface.rx_bytes;
        netTx += iface.tx_bytes;
      }
    }

    // Block I/O
    let blockRead = 0;
    let blockWrite = 0;
    const ioServiceBytes = blkioStats?.io_service_bytes_recursive;
    if (ioServiceBytes) {
      for (const entry of ioServiceBytes) {
        const op = entry.op.toLowerCase();
        if (op === 'read') blockRead += entry.value;
        else if (op === 'write') blockWrite += entry.value;
      }
    }

    return {
      stats: {
        cpuPercent: Math.round(cpuPercent * 100) / 100,
        memoryUsage: memUsage,
        memoryLimit: memLimit,
        memoryPercent: Math.round(memPercent * 100) / 100,
        networkRx: netRx,
        networkTx: netTx,
        blockRead,
        blockWrite,
        pids: pidsStats?.current ?? 0,
        timestamp: new Date(),
      },
      cpuTotal: cpuUsage,
      systemTotal: systemUsage,
    };
  }

  /**
   * Take a single stats reading without opening a stream.
   *
   * `streamStats` is selection-driven because a live stream per container is
   * expensive, which leaves list-wide concerns (sorting by CPU, showing a
   * CPU/MEM column) with no data for unselected rows. This is the cheap
   * counterpart: one request, no stream to tear down.
   *
   * The daemon embeds `precpu_stats` in a `stream:false` response, so CPU
   * percentage is computable from this single reading — `parseStats` falls
   * back to it when no previous sample is supplied.
   */
  async sampleStats(id: string): Promise<ContainerStats> {
    const container = this.docker.getContainer(id);
    // dockerode supports abortSignal here; its stats overload declarations lag behind.
    const snapshot: unknown = await this.request(abortSignal => container.stats({ stream: false, abortSignal } as { stream: false }));
    const validated = DockerStatsRawSchema.parse(snapshot);
    return this.parseStats(validated, 0, 0).stats;
  }

  async *streamStats(id: string, signal?: AbortSignal): AsyncIterable<ContainerStats> {
    if (signal?.aborted) return;
    // dockerode supports abortSignal here; its stats overload declarations lag behind.
    const requestOptions = { abortSignal: signal };
    const container = this.docker.getContainer(id);

    // One-shot fetch for instant first sample (stream:false returns immediately)
    let prevCpu = 0;
    let prevSystem = 0;
    try {
      const snapshot = await container.stats({ ...requestOptions, stream: false });
      if (signal?.aborted) return;
      const validated = DockerStatsRawSchema.parse(snapshot);
      const { stats: first, cpuTotal, systemTotal } = this.parseStats(validated, 0, 0);
      prevCpu = cpuTotal;
      prevSystem = systemTotal;
      yield first;
    } catch {
      // Fall through — stream will provide data
    }

    if (signal?.aborted) return;

    const stream = await streamRequest(container.stats({ ...requestOptions, stream: true }), signal);
    if (!stream) return;
    for await (const line of streamLines(abortableChunks(stream as unknown as AsyncIterable<Buffer>, signal))) {
      if (signal?.aborted) return;
      if (!line.trim()) continue;
      try {
        const raw: unknown = JSON.parse(line);
        const validated = DockerStatsRawSchema.parse(raw);
        const { stats, cpuTotal, systemTotal } = this.parseStats(validated, prevCpu, prevSystem);
        prevCpu = cpuTotal;
        prevSystem = systemTotal;
        yield stats;
      } catch {
        // Ignore a malformed complete record; never discard a partial transport chunk.
      }
    }
  }

  async listImages(all = false, signal?: AbortSignal): Promise<ImageInfo[]> {
    const images = await this.request(abortSignal => this.docker.listImages({ all, abortSignal }), signal);
    return images.map((img): ImageInfo => {
      const validated = ImageItemRawSchema.parse(img);
      // API ≥ 1.43 (Engine 24) reports an untagged image as `RepoTags: []`,
      // older daemons as `["<none>:<none>"]` or null. Normalise all three, or
      // dangling images go undetected and the image prune count reads 0.
      const tags = realImageTags(validated.RepoTags);
      // An image pulled by digest has no tags but still a digest reference;
      // `docker image prune` keeps it, so it is not dangling.
      const digests = (validated.RepoDigests ?? []).filter(d => d && d !== '<none>@<none>');
      return {
        id: shortId(validated.Id.replace('sha256:', '')),
        repoTags: tags.length > 0 ? tags : [UNTAGGED_IMAGE],
        size: validated.Size,
        created: new Date(validated.Created * 1000),
        isDangling: tags.length === 0 && digests.length === 0,
      };
    });
  }

  /**
   * Remove an image and every tag it carries.
   *
   * Docker refuses to delete an image by ID while more than one tag references
   * it (409 "must be forced"), so a multi-tag image is untagged by name
   * instead — the last untag deletes it. Tags are read fresh, since the
   * dashboard's list may predate a retag; and containers are checked first,
   * because untagging all but the last tag of an image a container still uses
   * would strip its names and then fail, leaving the image behind.
   */
  async removeImage(id: string): Promise<void> {
    const image = this.docker.getImage(id);
    // Image.inspect does not forward an abort signal; request()'s race still
    // enforces the deadline.
    const info = await this.request(() => image.inspect());
    const tags = realImageTags(info.RepoTags);
    if (tags.length <= 1) {
      await image.remove();
      return;
    }
    // Any container whose image descends from this one blocks the final
    // delete — directly, or through a child image built from it — so refuse
    // before the first untag rather than strip the names and then fail.
    const users = await this.request(abortSignal =>
      this.docker.listContainers({ all: true, filters: { ancestor: [info.Id] }, abortSignal }));
    if (users.length > 0) {
      const names = users.map(c => (c.Names?.[0] ?? shortId(c.Id)).replace(/^\//, ''));
      const one = names.length === 1;
      throw new Error(`Image is used by ${one ? 'container' : 'containers'} ${names.join(', ')} (directly or through an image built from it). Remove ${one ? 'it' : 'them'} first.`);
    }
    const removed: string[] = [];
    const fail = (err: unknown): never => {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(removed.length > 0 ? `Removed tags ${removed.join(', ')}; image kept: ${reason}` : reason);
    };
    for (const tag of tags) {
      try {
        await this.docker.getImage(tag).remove();
      } catch (err) {
        // A tag removed meanwhile is already gone, which is what we wanted.
        if (!isNotFound(err)) fail(err);
      }
      removed.push(tag);
    }
    // The last untag normally deletes the image; a digest reference (an image
    // also pulled by digest) can keep it alive, so finish by ID.
    try {
      await this.docker.getImage(info.Id).remove();
    } catch (err) {
      if (!isNotFound(err)) fail(err);
    }
  }

  async pruneImages(): Promise<{ spaceReclaimed: number }> {
    const result = await this.docker.pruneImages();
    const validated = PruneImagesResponseSchema.parse(result);
    return { spaceReclaimed: validated.SpaceReclaimed };
  }

  async listVolumes(): Promise<VolumeInfo[]> {
    const [result, containers, apiVersion] = await Promise.all([
      this.request(abortSignal => this.docker.listVolumes({ abortSignal })),
      this.rawContainers(true),
      this.getApiVersion(),
    ]);
    return buildVolumeInfos(result.Volumes || [], containers, volumePruneScope(apiVersion));
  }

  /**
   * The daemon's API version, read once per client. The client sends
   * unversioned requests, so the daemon answers with its newest API — which
   * decides, for instance, what a volume prune removes. Null when it cannot be
   * read; a failure is not cached, so the next call asks again.
   */
  getApiVersion(signal?: AbortSignal): Promise<string | null> {
    this.apiVersion ??= Promise.resolve()
      .then(() => this.request(abortSignal =>
        // version accepts abortSignal at runtime; its typings only declare a callback.
        (this.docker.version as (o: object) => Promise<Dockerode.DockerVersion>).call(this.docker, { abortSignal }), signal))
      .then(v => (typeof v.ApiVersion === 'string' && v.ApiVersion) || null)
      .catch(() => null)
      .then(version => {
        if (version === null) this.apiVersion = undefined;
        return version;
      });
    return this.apiVersion;
  }

  async removeVolume(name: string): Promise<void> {
    await this.docker.getVolume(name).remove();
  }

  async pruneVolumes(): Promise<{ spaceReclaimed: number }> {
    const result = await this.docker.pruneVolumes();
    const validated = PruneVolumesResponseSchema.parse(result);
    return { spaceReclaimed: validated.SpaceReclaimed };
  }

  async listNetworks(): Promise<NetworkInfo[]> {
    const [networks, containerList] = await Promise.all([
      this.request(abortSignal => this.docker.listNetworks({ abortSignal })),
      this.rawContainers(true),
    ]);
    return buildNetworkInfos(networks, containerList);
  }

  async removeNetwork(id: string): Promise<void> {
    await this.docker.getNetwork(id).remove();
  }

  async pruneNetworks(): Promise<{ networksDeleted: string[] }> {
    const result = await this.docker.pruneNetworks();
    const validated = PruneNetworksResponseSchema.parse(result);
    return { networksDeleted: validated.NetworksDeleted ?? [] };
  }

  /**
   * Remove all stopped containers.
   *
   * Images, volumes and networks all had a prune; containers did not, even
   * though clearing out stopped containers is the most routine cleanup there
   * is.
   */
  async pruneContainers(): Promise<{ containersDeleted: string[]; spaceReclaimed: number }> {
    const result = await this.docker.pruneContainers();
    const validated = PruneContainersResponseSchema.parse(result);
    return {
      containersDeleted: validated.ContainersDeleted ?? [],
      spaceReclaimed: validated.SpaceReclaimed,
    };
  }

  /**
   * Aggregate disk usage (`docker system df`).
   *
   * Answers "what is eating my disk" in one call. Build cache in particular is
   * represented nowhere else in the app, and is often the largest consumer.
   */
  async diskUsage(): Promise<DiskUsage> {
    const raw: unknown = await this.request(abortSignal => (this.docker.df as (o: object) => Promise<unknown>).call(this.docker, { abortSignal }));
    const v = DiskUsageResponseSchema.parse(raw);

    // LayersSize is the authoritative image total; the per-image Size figures
    // double-count shared layers.
    const imagesSize = v.LayersSize;
    const containersSize = (v.Containers ?? []).reduce((sum, c) => sum + c.SizeRw, 0);
    const volumesSize = (v.Volumes ?? []).reduce((sum, vol) => sum + (vol.UsageData?.Size ?? 0), 0);
    const cache = v.BuildCache ?? [];
    const buildCacheSize = cache.reduce((sum, b) => sum + b.Size, 0);
    // Matches `docker system df`: a shared record is not reclaimable even
    // when nothing currently uses it.
    const buildCacheReclaimable = cache.filter(b => !b.InUse && !b.Shared).reduce((sum, b) => sum + b.Size, 0);

    return {
      imagesSize,
      containersSize,
      volumesSize,
      buildCacheSize,
      buildCacheReclaimable,
      totalSize: imagesSize + containersSize + volumesSize + buildCacheSize,
    };
  }

  async getContainerChanges(id: string): Promise<FilesystemChange[]> {
    const container = this.docker.getContainer(id);
    const raw: unknown = await this.request(abortSignal => (container.changes as (o: object) => Promise<unknown>).call(container, { abortSignal }));
    const validated = ContainerChangesResponseSchema.parse(raw);
    return (validated || []).map(c => ({
      path: c.Path,
      kind: c.Kind === 1 ? 'added' as const : c.Kind === 2 ? 'deleted' as const : 'changed' as const,
    }));
  }

  async getImageHistory(nameOrId: string): Promise<ImageLayer[]> {
    const image = this.docker.getImage(nameOrId);
    // history() takes no options at all (an object would be taken as the callback); the deadline race still applies.
    const raw: unknown = await this.request(() => image.history());
    const validated = ImageHistoryResponseSchema.parse(raw);
    return validated.map(h => ({
      id: h.Id === '<missing>' ? '' : shortId(h.Id.replace('sha256:', '')),
      created: new Date(h.Created * 1000),
      createdBy: cleanDockerInstruction(h.CreatedBy),
      size: h.Size,
      comment: h.Comment,
    }));
  }

  async *streamEvents(filters?: Record<string, string[]>, signal?: AbortSignal): AsyncIterable<DockerEvent> {
    if (signal?.aborted) return;
    const stream = await streamRequest(this.docker.getEvents({ filters, abortSignal: signal }), signal);
    if (!stream) return;

    for await (const line of streamLines(abortableChunks(stream as unknown as AsyncIterable<Buffer>, signal))) {
      if (signal?.aborted) return;
      if (!line.trim()) continue;
      try {
        const event = DockerEventRawSchema.parse(JSON.parse(line));
        yield {
          type: event.Action || event.status || 'unknown',
          resourceType: mapResourceType(event.Type),
          resourceId: event.Actor?.ID || '',
          timestamp: new Date(event.time * 1000),
          attributes: event.Actor?.Attributes || {},
        };
      } catch {
        // A malformed complete event must not prevent subsequent events.
      }
    }
  }

  dispose(): void {
    // Dockerode doesn't maintain persistent connections to close,
    // but this allows for future cleanup if needed
  }
}

/** Map one raw `GET /containers/json` row to the app's container shape. */
export function toContainerInfo(c: RawContainer): ContainerInfo {
  let healthStatus: ContainerInfo['healthStatus'];
  if (/\(healthy\)/.test(c.Status)) healthStatus = 'healthy';
  else if (/\(unhealthy\)/.test(c.Status)) healthStatus = 'unhealthy';
  else if (/\(health: starting\)/.test(c.Status)) healthStatus = 'starting';

  return {
    id: c.Id,
    name: (c.Names[0] || '').replace(/^\//, ''),
    image: c.Image,
    state: ContainerStateSchema.parse(c.State),
    status: c.Status,
    ports: (c.Ports || []).map((p): PortBinding => ({
      hostIp: p.IP || '0.0.0.0',
      hostPort: p.PublicPort || 0,
      containerPort: p.PrivatePort,
      protocol: PortProtocolSchema.parse(p.Type || 'tcp'),
    })),
    created: new Date(c.Created * 1000),
    composeProject: c.Labels?.['com.docker.compose.project'],
    composeService: c.Labels?.['com.docker.compose.service'],
    labels: c.Labels,
    healthStatus,
  };
}

/** docker-modem rejects a 404 with `statusCode: 404`. */
function isNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { statusCode?: unknown }).statusCode === 404;
}

/** Set by Engine 23+ on volumes created without a name. */
const ANONYMOUS_VOLUME_LABEL = 'com.docker.volume.anonymous';

/** "1.43" ≥ "1.42", compared numerically per component. */
function apiVersionAtLeast(version: string, min: string): boolean {
  const a = version.split('.').map(Number);
  const b = min.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (Number.isNaN(x)) return false;
    if (x !== y) return x > y;
  }
  return true;
}

/** What `docker volume prune` (no filters) removes on a daemon speaking `apiVersion`. */
export function volumePruneScope(apiVersion: string | null): VolumePruneScope {
  if (!apiVersion || !/^\d+(\.\d+)*$/.test(apiVersion)) return 'unknown';
  return apiVersionAtLeast(apiVersion, '1.42') ? 'anonymous' : 'all';
}

/** Volumes, annotated with which containers mount them (from a raw container listing). */
export function buildVolumeInfos(volumes: unknown[], containers: RawContainer[], pruneScope: VolumePruneScope = 'unknown'): VolumeInfo[] {
  // Keep *which* containers use each volume, not just whether any do. A Set
  // because one container can mount the same named volume at more than one
  // path, and it should still be listed once.
  const volumeUsers = new Map<string, Set<string>>();
  for (const c of containers) {
    const containerName = (c.Names?.[0] || c.Id).replace(/^\//, '');
    for (const mount of c.Mounts || []) {
      if (!mount.Name) continue;
      const users = volumeUsers.get(mount.Name);
      if (users) users.add(containerName);
      else volumeUsers.set(mount.Name, new Set([containerName]));
    }
  }

  return volumes.map((v): VolumeInfo => {
    const validated = VolumeItemRawSchema.parse(v);
    return {
      name: validated.Name,
      driver: validated.Driver,
      mountpoint: validated.Mountpoint,
      created: new Date(validated.CreatedAt || 0),
      isInUse: volumeUsers.has(validated.Name),
      usedBy: [...(volumeUsers.get(validated.Name) ?? [])],
      anonymous: validated.Labels?.[ANONYMOUS_VOLUME_LABEL] !== undefined,
      pruneScope,
    };
  });
}

/**
 * Networks, annotated with their attached containers.
 *
 * GET /networks omits the Containers map entirely — only `network inspect`
 * returns it — so attachments are derived from the container listing, which
 * does carry NetworkSettings.Networks.
 */
export function buildNetworkInfos(networks: Dockerode.NetworkInspectInfo[], containerList: RawContainer[]): NetworkInfo[] {
  const defaultNetworks = ['bridge', 'host', 'none'];

  const membersByNetwork = new Map<string, NetworkContainerRef[]>();
  for (const c of containerList) {
    const attached = (c as { NetworkSettings?: { Networks?: Record<string, unknown> } })
      .NetworkSettings?.Networks ?? {};
    for (const [netName, raw] of Object.entries(attached)) {
      const validated = ContainerNetworkAttachmentRawSchema.parse(raw);
      const ref: NetworkContainerRef = {
        containerId: shortId(c.Id),
        containerName: (c.Names?.[0] || c.Id).replace(/^\//, ''),
        ipv4Address: validated.IPAddress || undefined,
        ipv6Address: validated.GlobalIPv6Address || undefined,
        macAddress: validated.MacAddress || undefined,
      };
      const existing = membersByNetwork.get(netName);
      if (existing) existing.push(ref);
      else membersByNetwork.set(netName, [ref]);
    }
  }

  return networks.map((n): NetworkInfo => {
    const containers = membersByNetwork.get(n.Name) ?? [];

    // The daemon returns the address pools on the listing; they were being
    // dropped, which is why "which subnet is this on / what IP does this
    // container have" was unanswerable in either frontend.
    const ipamRaw = (n as { IPAM?: { Driver?: string; Config?: unknown[] } }).IPAM;
    const ipam = (ipamRaw?.Config ?? []).map((entry) => {
      const cfg = NetworkIpamConfigRawSchema.parse(entry);
      return { subnet: cfg.Subnet, gateway: cfg.Gateway, ipRange: cfg.IPRange };
    });

    return {
      id: shortId(n.Id),
      name: n.Name,
      driver: n.Driver || '',
      scope: n.Scope || '',
      containers,
      isDefault: defaultNetworks.includes(n.Name),
      ipamDriver: ipamRaw?.Driver || undefined,
      ipam,
      internal: Boolean((n as { Internal?: boolean }).Internal),
      attachable: Boolean((n as { Attachable?: boolean }).Attachable),
      labels: (n as { Labels?: Record<string, string> }).Labels ?? {},
    };
  });
}

function mapResourceType(type: string): DockerResourceType {
  switch (type) {
    case 'container': return 'container';
    case 'image': return 'image';
    case 'volume': return 'volume';
    case 'network': return 'network';
    default: return 'daemon';
  }
}

function cleanDockerInstruction(raw: string): string {
  return raw.replace(/^\/bin\/sh -c (#\(nop\)\s+)?/, '').trim();
}

export interface DemuxedFrame {
  stream: 'stdout' | 'stderr';
  /** Raw bytes (a view into the input): a UTF-8 character may span two frames, so decode with a LineDecoder. */
  payload: Buffer;
}

/**
 * Split a Docker multiplexed log buffer into complete frames.
 * Frame layout: [stream_type(1), 0, 0, 0, size_be(4)] + payload.
 * `rest` holds trailing bytes of an incomplete frame (subarray view — copy before retaining).
 */
export function demuxFrames(buf: Buffer): { frames: DemuxedFrame[]; rest: Buffer } {
  const frames: DemuxedFrame[] = [];
  let offset = 0;
  while (offset + 8 <= buf.length) {
    const streamType = buf[offset];
    const size = buf.readUInt32BE(offset + 4);
    if (offset + 8 + size > buf.length) break;
    frames.push({
      stream: streamType === 2 ? 'stderr' : 'stdout',
      payload: buf.subarray(offset + 8, offset + 8 + size),
    });
    offset += 8 + size;
  }
  return { frames, rest: buf.subarray(offset) };
}

/** Heuristic: does this buffer start with a multiplexed-frame header? */
export function looksMultiplexed(buf: Buffer): boolean {
  return buf.length >= 8
    && (buf[0] === 0 || buf[0] === 1 || buf[0] === 2)
    && buf[1] === 0 && buf[2] === 0 && buf[3] === 0;
}

function parseLogLine(line: string, defaultStream: 'stdout' | 'stderr'): LogEntry {
  // Docker log lines with timestamps: "2024-01-15T10:30:00.123456789Z message"
  const tsMatch = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z?)\s+(.*)$/);
  if (tsMatch) {
    return {
      timestamp: new Date(tsMatch[1]),
      stream: defaultStream,
      message: tsMatch[2],
    };
  }
  return {
    timestamp: null,
    stream: defaultStream,
    message: line,
  };
}
