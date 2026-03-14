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
import { DockerStatsRawSchema, DockerEventRawSchema } from './schemas';
import type { DockerStatsRaw } from './schemas';

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
    return containers.map((c): ContainerInfo => {
      let healthStatus: ContainerInfo['healthStatus'];
      if (/\(healthy\)/.test(c.Status)) healthStatus = 'healthy';
      else if (/\(unhealthy\)/.test(c.Status)) healthStatus = 'unhealthy';
      else if (/\(health: starting\)/.test(c.Status)) healthStatus = 'starting';

      return {
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
        healthStatus,
      };
    });
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

  async *streamStats(id: string): AsyncIterable<ContainerStats> {
    const container = this.docker.getContainer(id);

    // One-shot fetch for instant first sample (stream:false returns immediately)
    let prevCpu = 0;
    let prevSystem = 0;
    try {
      const snapshot = await container.stats({ stream: false });
      const validated = DockerStatsRawSchema.parse(snapshot);
      const { stats: first, cpuTotal, systemTotal } = this.parseStats(validated, 0, 0);
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
        try {
          const raw: unknown = JSON.parse(line);
          const validated = DockerStatsRawSchema.parse(raw);
          const { stats, cpuTotal, systemTotal } = this.parseStats(validated, prevCpu, prevSystem);
          prevCpu = cpuTotal;
          prevSystem = systemTotal;
          yield stats;
        } catch {
          continue;
        }
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
        try {
          const raw: unknown = JSON.parse(line);
          const event = DockerEventRawSchema.parse(raw);
          const resourceType = mapResourceType(event.Type);

          yield {
            type: event.Action || event.status || 'unknown',
            resourceType,
            resourceId: event.Actor?.ID || '',
            timestamp: new Date(event.time * 1000),
            attributes: event.Actor?.Attributes || {},
          };
        } catch {
          continue;
        }
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
