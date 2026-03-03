import Dockerode from 'dockerode';
import type {
  ContainerInfo,
  ContainerStats,
  LogEntry,
  PortBinding,
  ImageInfo,
  VolumeInfo,
  NetworkInfo,
  NetworkContainerRef,
  DockerEvent,
  DockerResourceType,
} from '../types';

export interface DockerClientOptions {
  socketPath?: string;
  host?: string;
  port?: number;
}

export interface LogStreamOptions {
  tail?: number;
  since?: number;
  follow?: boolean;
  stdout?: boolean;
  stderr?: boolean;
}

export class DockerClient {
  private docker: Dockerode;

  constructor(opts?: DockerClientOptions) {
    this.docker = new Dockerode(opts);
  }

  async ping(): Promise<boolean> {
    try {
      await this.docker.ping();
      return true;
    } catch {
      return false;
    }
  }

  async listContainers(all = true): Promise<ContainerInfo[]> {
    const containers = await this.docker.listContainers({ all });
    return containers.map((c): ContainerInfo => ({
      id: c.Id,
      name: (c.Names[0] || '').replace(/^\//, ''),
      image: c.Image,
      state: c.State as ContainerInfo['state'],
      status: c.Status,
      ports: (c.Ports || []).map((p): PortBinding => ({
        hostIp: p.IP || '0.0.0.0',
        hostPort: p.PublicPort || 0,
        containerPort: p.PrivatePort,
        protocol: (p.Type || 'tcp') as 'tcp' | 'udp',
      })),
      created: new Date(c.Created * 1000),
      composeProject: c.Labels?.['com.docker.compose.project'],
      composeService: c.Labels?.['com.docker.compose.service'],
    }));
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

  async removeContainer(id: string, force = false): Promise<void> {
    await this.docker.getContainer(id).remove({ force });
  }

  async inspectContainer(id: string): Promise<Dockerode.ContainerInspectInfo> {
    return this.docker.getContainer(id).inspect();
  }

  async *streamLogs(id: string, opts: LogStreamOptions = {}): AsyncIterable<LogEntry> {
    const container = this.docker.getContainer(id);
    const logOpts = {
      follow: true as const,
      stdout: opts.stdout ?? true,
      stderr: opts.stderr ?? true,
      tail: opts.tail ?? 100,
      since: opts.since ?? 0,
      timestamps: true,
    };

    const stream = opts.follow === false
      ? await container.logs({ ...logOpts, follow: false as const })
      : await container.logs(logOpts);

    // Docker multiplexed stream: 8 byte header + payload
    // Header: [stream_type(1), 0, 0, 0, size(4)]
    // stream_type: 1=stdout, 2=stderr
    if (typeof stream === 'string' || Buffer.isBuffer(stream)) {
      const text = Buffer.isBuffer(stream) ? stream.toString('utf8') : stream;
      for (const line of text.split('\n')) {
        if (line) {
          yield parseLogLine(line, 'stdout');
        }
      }
      return;
    }

    const readable = stream as unknown as NodeJS.ReadableStream;
    const buffer: Buffer[] = [];

    for await (const chunk of readable) {
      const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
      buffer.push(data);
      const combined = Buffer.concat(buffer);
      buffer.length = 0;

      let offset = 0;
      while (offset + 8 <= combined.length) {
        const streamType = combined[offset];
        const size = combined.readUInt32BE(offset + 4);

        if (offset + 8 + size > combined.length) {
          // Incomplete frame, save remainder
          buffer.push(combined.subarray(offset));
          break;
        }

        const payload = combined.subarray(offset + 8, offset + 8 + size).toString('utf8');
        const streamName: 'stdout' | 'stderr' = streamType === 2 ? 'stderr' : 'stdout';

        for (const line of payload.split('\n')) {
          if (line.trim()) {
            yield parseLogLine(line, streamName);
          }
        }

        offset += 8 + size;
      }

      if (offset < combined.length && buffer.length === 0) {
        buffer.push(combined.subarray(offset));
      }
    }
  }

  private parseStats(
    raw: Record<string, unknown>,
    prevCpu: number,
    prevSystem: number,
  ): { stats: ContainerStats; cpuTotal: number; systemTotal: number } {
    const cpuStats = raw.cpu_stats as Record<string, unknown> | undefined;
    const preCpuStats = raw.precpu_stats as Record<string, unknown> | undefined;
    const memStats = raw.memory_stats as Record<string, unknown> | undefined;
    const netStats = raw.networks as Record<string, Record<string, number>> | undefined;
    const pidsStats = raw.pids_stats as Record<string, number> | undefined;

    // CPU calculation
    const cpuUsage = (cpuStats?.cpu_usage as Record<string, number>)?.total_usage ?? 0;
    const systemUsage = (cpuStats?.system_cpu_usage as number) ?? 0;
    const numCpus = ((cpuStats?.cpu_usage as Record<string, unknown>)?.percpu_usage as unknown[])?.length
      ?? (cpuStats?.online_cpus as number)
      ?? 1;

    const cpuDelta = cpuUsage - (prevCpu || ((preCpuStats?.cpu_usage as Record<string, number>)?.total_usage ?? 0));
    const systemDelta = systemUsage - (prevSystem || ((preCpuStats?.system_cpu_usage as number) ?? 0));

    const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * numCpus * 100 : 0;

    // Memory
    const memUsage = (memStats?.usage as number) ?? 0;
    const memLimit = (memStats?.limit as number) ?? 0;
    const memPercent = memLimit > 0 ? (memUsage / memLimit) * 100 : 0;

    // Network
    let netRx = 0;
    let netTx = 0;
    if (netStats) {
      for (const iface of Object.values(netStats)) {
        netRx += iface.rx_bytes ?? 0;
        netTx += iface.tx_bytes ?? 0;
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
        pids: pidsStats?.current ?? 0,
        timestamp: new Date(),
      },
      cpuTotal: cpuUsage,
      systemTotal: systemUsage,
    };
  }

  async *streamStats(id: string): AsyncIterable<ContainerStats> {
    const container = this.docker.getContainer(id);

    // One-shot fetch for instant first sample (stream:false returns immediately)
    let prevCpu = 0;
    let prevSystem = 0;
    try {
      const snapshot = await container.stats({ stream: false }) as unknown as Record<string, unknown>;
      const { stats: first, cpuTotal, systemTotal } = this.parseStats(snapshot, 0, 0);
      prevCpu = cpuTotal;
      prevSystem = systemTotal;
      yield first;
    } catch {
      // Fall through — stream will provide data
    }

    const stream = await container.stats({ stream: true });

    for await (const chunk of stream as AsyncIterable<Buffer>) {
      const lines = chunk.toString('utf8').split('\n').filter(Boolean);
      for (const line of lines) {
        let raw: Record<string, unknown>;
        try {
          raw = JSON.parse(line);
        } catch {
          continue;
        }

        const { stats, cpuTotal, systemTotal } = this.parseStats(raw, prevCpu, prevSystem);
        prevCpu = cpuTotal;
        prevSystem = systemTotal;
        yield stats;
      }
    }
  }

  async listImages(all = false): Promise<ImageInfo[]> {
    const images = await this.docker.listImages({ all });
    return images.map((img): ImageInfo => ({
      id: img.Id.replace('sha256:', '').substring(0, 12),
      repoTags: img.RepoTags || ['<none>:<none>'],
      size: img.Size,
      created: new Date(img.Created * 1000),
      isDangling: !img.RepoTags || img.RepoTags[0] === '<none>:<none>',
    }));
  }

  async removeImage(id: string): Promise<void> {
    await this.docker.getImage(id).remove();
  }

  async pruneImages(): Promise<{ spaceReclaimed: number }> {
    const result = await this.docker.pruneImages();
    return { spaceReclaimed: result.SpaceReclaimed ?? 0 };
  }

  async listVolumes(): Promise<VolumeInfo[]> {
    const result = await this.docker.listVolumes();
    const volumes = result.Volumes || [];
    // Get containers to check volume usage
    const containers = await this.docker.listContainers({ all: true });
    const usedVolumes = new Set<string>();
    for (const c of containers) {
      for (const mount of c.Mounts || []) {
        if (mount.Name) usedVolumes.add(mount.Name);
      }
    }

    return volumes.map((v): VolumeInfo => ({
      name: v.Name,
      driver: v.Driver,
      mountpoint: v.Mountpoint,
      created: new Date((v as unknown as Record<string, unknown>).CreatedAt as string || 0),
      isInUse: usedVolumes.has(v.Name),
    }));
  }

  async removeVolume(name: string): Promise<void> {
    await this.docker.getVolume(name).remove();
  }

  async pruneVolumes(): Promise<{ spaceReclaimed: number }> {
    const result = await this.docker.pruneVolumes();
    return { spaceReclaimed: result.SpaceReclaimed ?? 0 };
  }

  async listNetworks(): Promise<NetworkInfo[]> {
    const networks = await this.docker.listNetworks();
    const defaultNetworks = ['bridge', 'host', 'none'];

    return networks.map((n): NetworkInfo => {
      const containers: NetworkContainerRef[] = [];
      if (n.Containers) {
        for (const [id, info] of Object.entries(n.Containers)) {
          const c = info as { Name?: string };
          containers.push({
            containerId: id.substring(0, 12),
            containerName: c.Name || id.substring(0, 12),
          });
        }
      }

      return {
        id: n.Id.substring(0, 12),
        name: n.Name,
        driver: n.Driver || '',
        scope: n.Scope || '',
        containers,
        isDefault: defaultNetworks.includes(n.Name),
      };
    });
  }

  async removeNetwork(id: string): Promise<void> {
    await this.docker.getNetwork(id).remove();
  }

  async pruneNetworks(): Promise<{ networksDeleted: string[] }> {
    const result = await this.docker.pruneNetworks();
    return { networksDeleted: result.NetworksDeleted || [] };
  }

  async *streamEvents(filters?: Record<string, string[]>, signal?: AbortSignal): AsyncIterable<DockerEvent> {
    const stream = await this.docker.getEvents({ filters });

    // Wire up AbortSignal to destroy the underlying stream
    if (signal) {
      const onAbort = () => (stream as NodeJS.ReadableStream & { destroy?: () => void }).destroy?.();
      signal.addEventListener('abort', onAbort, { once: true });
    }

    for await (const chunk of stream as AsyncIterable<Buffer>) {
      if (signal?.aborted) break;
      const lines = chunk.toString('utf8').split('\n').filter(Boolean);
      for (const line of lines) {
        let raw: Record<string, unknown>;
        try {
          raw = JSON.parse(line);
        } catch {
          continue;
        }

        const type = raw.Type as string || 'container';
        const resourceType = mapResourceType(type);
        const actor = raw.Actor as Record<string, unknown> | undefined;

        yield {
          type: raw.Action as string || raw.status as string || 'unknown',
          resourceType,
          resourceId: (actor?.ID as string) || '',
          timestamp: new Date((raw.time as number || 0) * 1000),
          attributes: (actor?.Attributes as Record<string, string>) || {},
        };
      }
    }
  }

  dispose(): void {
    // Dockerode doesn't maintain persistent connections to close,
    // but this allows for future cleanup if needed
  }
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
