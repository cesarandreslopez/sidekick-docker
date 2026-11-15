import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DockerClient, demuxFrames, looksMultiplexed, volumePruneScope } from './DockerClient';

// Mock dockerode
vi.mock('dockerode', () => {
  return {
    default: vi.fn().mockImplementation(function () {
      return {
        ping: vi.fn().mockResolvedValue('OK'),
        version: vi.fn().mockResolvedValue({ ApiVersion: '1.45' }),
        listContainers: vi.fn().mockResolvedValue([
          {
            Id: 'abc123def456',
            Names: ['/test-container'],
            Image: 'nginx:latest',
            State: 'running',
            Status: 'Up 5 minutes',
            Ports: [{ IP: '0.0.0.0', PublicPort: 8080, PrivatePort: 80, Type: 'tcp' }],
            Created: Math.floor(Date.now() / 1000),
            Labels: {
              'com.docker.compose.project': 'myapp',
              'com.docker.compose.service': 'web',
            },
            Mounts: [],
          },
        ]),
        listImages: vi.fn().mockResolvedValue([
          {
            Id: 'sha256:abc123def456',
            RepoTags: ['nginx:latest'],
            Size: 142000000,
            Created: Math.floor(Date.now() / 1000),
          },
        ]),
        listVolumes: vi.fn().mockResolvedValue({
          Volumes: [
            {
              Name: 'test-vol',
              Driver: 'local',
              Mountpoint: '/var/lib/docker/volumes/test-vol/_data',
              CreatedAt: new Date().toISOString(),
            },
          ],
        }),
        listNetworks: vi.fn().mockResolvedValue([
          {
            Id: 'abc123def456',
            Name: 'bridge',
            Driver: 'bridge',
            Scope: 'local',
            Containers: {},
          },
        ]),
        getContainer: vi.fn().mockReturnValue({
          start: vi.fn().mockResolvedValue(undefined),
          stop: vi.fn().mockResolvedValue(undefined),
          restart: vi.fn().mockResolvedValue(undefined),
          remove: vi.fn().mockResolvedValue(undefined),
          inspect: vi.fn().mockResolvedValue({ Id: 'abc123' }),
        }),
        getImage: vi.fn().mockReturnValue({
          remove: vi.fn().mockResolvedValue(undefined),
        }),
        getVolume: vi.fn().mockReturnValue({
          remove: vi.fn().mockResolvedValue(undefined),
        }),
        getNetwork: vi.fn().mockReturnValue({
          remove: vi.fn().mockResolvedValue(undefined),
        }),
        pruneImages: vi.fn().mockResolvedValue({ SpaceReclaimed: 100000 }),
        pruneVolumes: vi.fn().mockResolvedValue({ SpaceReclaimed: 50000 }),
        pruneNetworks: vi.fn().mockResolvedValue({ NetworksDeleted: ['net1'] }),
      };
    }),
  };
});

describe('DockerClient', () => {
  let client: DockerClient;

  beforeEach(() => {
    client = new DockerClient();
  });

  it('ping returns true when Docker is available', async () => {
    expect(await client.ping()).toBe(true);
  });

  it('listContainers returns formatted container info', async () => {
    const containers = await client.listContainers();
    expect(containers).toHaveLength(1);
    expect(containers[0].name).toBe('test-container');
    expect(containers[0].image).toBe('nginx:latest');
    expect(containers[0].state).toBe('running');
    expect(containers[0].composeProject).toBe('myapp');
    expect(containers[0].composeService).toBe('web');
    expect(containers[0].ports).toHaveLength(1);
    expect(containers[0].ports[0].hostPort).toBe(8080);
  });

  it('listImages returns formatted image info', async () => {
    const images = await client.listImages();
    expect(images).toHaveLength(1);
    expect(images[0].id).toBe('abc123def456');
    expect(images[0].repoTags).toEqual(['nginx:latest']);
    expect(images[0].isDangling).toBe(false);
  });

  it('listVolumes returns formatted volume info', async () => {
    const volumes = await client.listVolumes();
    expect(volumes).toHaveLength(1);
    expect(volumes[0].name).toBe('test-vol');
    expect(volumes[0].driver).toBe('local');
    expect(volumes[0].anonymous).toBe(false);
    expect(volumes[0].pruneScope).toBe('anonymous');
  });

  it('marks anonymous volumes and reads the prune scope from the daemon API version', async () => {
    const c = new DockerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = (c as any).docker;
    d.listVolumes = vi.fn().mockResolvedValue({ Volumes: [
      { Name: 'a1b2', Driver: 'local', Mountpoint: '/x', Labels: { 'com.docker.volume.anonymous': '' } },
      { Name: 'named', Driver: 'local', Mountpoint: '/y', Labels: null },
    ] });
    d.version = vi.fn().mockResolvedValue({ ApiVersion: '1.41' });
    const vols = await c.listVolumes();
    expect(vols.map(v => v.anonymous)).toEqual([true, false]);
    expect(vols.every(v => v.pruneScope === 'all')).toBe(true);
    await c.listVolumes();
    expect(d.version).toHaveBeenCalledTimes(1);
  });

  it('retries the version lookup after a failure and reports the scope as unknown meanwhile', async () => {
    const c = new DockerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = (c as any).docker;
    d.version = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue({ ApiVersion: '1.43' });
    expect((await c.listVolumes())[0].pruneScope).toBe('unknown');
    expect((await c.listVolumes())[0].pruneScope).toBe('anonymous');
  });

  it('volumePruneScope compares API versions numerically', () => {
    expect(volumePruneScope('1.42')).toBe('anonymous');
    expect(volumePruneScope('1.100')).toBe('anonymous');
    expect(volumePruneScope('1.41')).toBe('all');
    expect(volumePruneScope('1.9')).toBe('all');
    expect(volumePruneScope(null)).toBe('unknown');
  });

  it('listImages detects untagged images however the daemon reports them', async () => {
    const c = new DockerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (c as any).docker.listImages = vi.fn().mockResolvedValue([
      { Id: 'sha256:aaaaaaaaaaaa1', RepoTags: [], Size: 1, Created: 0 },
      { Id: 'sha256:bbbbbbbbbbbb1', RepoTags: ['<none>:<none>'], Size: 1, Created: 0 },
      { Id: 'sha256:cccccccccccc1', RepoTags: null, Size: 1, Created: 0 },
      { Id: 'sha256:dddddddddddd1', RepoTags: ['app:1'], Size: 1, Created: 0 },
    ]);
    const images = await c.listImages();
    expect(images.map(i => i.isDangling)).toEqual([true, true, true, false]);
    expect(images[0].repoTags).toEqual(['<none>:<none>']);
  });

  describe('removeImage', () => {
    function setup(repoTags: string[] | null, containers: unknown[] = []) {
      const c = new DockerClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = (c as any).docker;
      const removed: string[] = [];
      d.getImage = vi.fn((name: string) => ({
        inspect: vi.fn().mockResolvedValue({ Id: 'sha256:full', RepoTags: repoTags }),
        remove: vi.fn(async () => { removed.push(name); }),
      }));
      d.listContainers = vi.fn().mockResolvedValue(containers);
      return { c, d, removed };
    }

    it('removes a single-tag image by id', async () => {
      const { c, removed } = setup(['app:latest']);
      await c.removeImage('abc');
      expect(removed).toEqual(['abc']);
    });

    it('untags a multi-tag image by name, using the tags read fresh', async () => {
      const { c, d, removed } = setup(['app:latest', 'app:1.2']);
      await c.removeImage('abc');
      expect(removed).toEqual(['app:latest', 'app:1.2']);
      expect(d.listContainers).toHaveBeenCalledWith(expect.objectContaining({ all: true, filters: { ancestor: ['sha256:full'] } }));
    });

    it('refuses before untagging when a container uses the image', async () => {
      const { c, removed } = setup(['app:latest', 'app:1.2'], [{ Id: 'c1', Names: ['/web'], ImageID: 'sha256:full' }]);
      await expect(c.removeImage('abc')).rejects.toThrow('Image is used by container web. Remove it first.');
      expect(removed).toEqual([]);
    });

    it('ignores containers of child images matched by the ancestor filter', async () => {
      const { c, removed } = setup(['base:1', 'base:latest'], [{ Id: 'c1', Names: ['/kid'], ImageID: 'sha256:child' }]);
      await c.removeImage('abc');
      expect(removed).toEqual(['base:1', 'base:latest']);
    });
  });

  it('listNetworks returns formatted network info', async () => {
    const networks = await client.listNetworks();
    expect(networks).toHaveLength(1);
    expect(networks[0].name).toBe('bridge');
    expect(networks[0].isDefault).toBe(true);
  });

  it('container lifecycle methods call dockerode', async () => {
    await expect(client.startContainer('abc')).resolves.toBeUndefined();
    await expect(client.stopContainer('abc')).resolves.toBeUndefined();
    await expect(client.restartContainer('abc')).resolves.toBeUndefined();
    await expect(client.removeContainer('abc')).resolves.toBeUndefined();
  });

  it('pruneImages returns space reclaimed', async () => {
    const result = await client.pruneImages();
    expect(result.spaceReclaimed).toBe(100000);
  });

  it('pruneNetworks returns deleted networks', async () => {
    const result = await client.pruneNetworks();
    expect(result.networksDeleted).toEqual(['net1']);
  });

  it('pingDetailed preserves the underlying error', async () => {
    const failing = new DockerClient();
    const err = Object.assign(new Error('connect ENOENT /var/run/docker.sock'), { code: 'ENOENT' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (failing as any).docker.ping = vi.fn().mockRejectedValue(err);
    const result = await failing.pingDetailed();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(err);
    expect(await failing.ping()).toBe(false);
  });

  describe('listResources', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const docker = (c: DockerClient) => (c as any).docker as Record<string, ReturnType<typeof vi.fn>>;

    it('derives volume usage and network members from a single container listing', async () => {
      const d = docker(client);
      d.listContainers.mockResolvedValueOnce([{
        Id: 'c1', Names: ['/web'], Image: 'nginx', State: 'running', Status: 'Up', Ports: [], Created: 0, Labels: {},
        Mounts: [{ Name: 'test-vol' }],
        NetworkSettings: { Networks: { bridge: { IPAddress: '172.17.0.2' } } },
      }]);
      const r = await client.listResources();
      expect(d.listContainers).toHaveBeenCalledTimes(1);
      expect(r.containers.status).toBe('fulfilled');
      expect(r.volumes).toMatchObject({ status: 'fulfilled', value: [{ name: 'test-vol', isInUse: true, usedBy: ['web'] }] });
      expect(r.networks).toMatchObject({ status: 'fulfilled', value: [{ name: 'bridge', containers: [{ containerName: 'web', ipv4Address: '172.17.0.2' }] }] });
      expect(r.images?.status).toBe('fulfilled');
    });

    it('fails volumes and networks with the container listing instead of reporting them unused', async () => {
      docker(client).listContainers.mockRejectedValueOnce(new Error('daemon gone'));
      const r = await client.listResources();
      expect(r.containers.status).toBe('rejected');
      expect(r.volumes?.status).toBe('rejected');
      expect(r.networks?.status).toBe('rejected');
      expect(r.images?.status).toBe('fulfilled');
    });

    it('skips resources that are switched off and forwards the abort signal', async () => {
      const d = docker(client);
      const abort = new AbortController();
      const r = await client.listResources({ images: false, volumes: false, networks: false, signal: abort.signal });
      expect(Object.keys(r)).toEqual(['containers']);
      expect(d.listImages).not.toHaveBeenCalled();
      expect(d.listContainers.mock.calls[0][0]).toMatchObject({ all: true, abortSignal: expect.any(AbortSignal) });
    });
  });

  it('gives up on a read that outlives requestTimeoutMs', async () => {
    const slow = new DockerClient({ requestTimeoutMs: 50 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (slow as any).docker.listContainers = vi.fn(() => new Promise(() => {}));
    await expect(slow.listContainers()).rejects.toThrow(/did not respond within/);
  });
});

function frame(streamType: 1 | 2, payload: string): Buffer {
  const body = Buffer.from(payload, 'utf8');
  const header = Buffer.alloc(8);
  header[0] = streamType;
  header.writeUInt32BE(body.length, 4);
  return Buffer.concat([header, body]);
}

describe('demuxFrames', () => {
  it('splits multiplexed stdout and stderr frames', () => {
    const buf = Buffer.concat([frame(1, 'out line\n'), frame(2, 'err line\n')]);
    const { frames, rest } = demuxFrames(buf);
    expect(frames.map(f => ({ stream: f.stream, payload: f.payload.toString() }))).toEqual([
      { stream: 'stdout', payload: 'out line\n' },
      { stream: 'stderr', payload: 'err line\n' },
    ]);
    expect(rest.length).toBe(0);
  });

  it('returns the trailing incomplete frame as rest', () => {
    const full = frame(1, 'complete\n');
    const partial = frame(2, 'partial payload').subarray(0, 10);
    const { frames, rest } = demuxFrames(Buffer.concat([full, partial]));
    expect(frames).toHaveLength(1);
    expect(frames[0].payload.toString()).toBe('complete\n');
    expect(rest.length).toBe(10);
  });
});

describe('looksMultiplexed', () => {
  it('detects a multiplexed header', () => {
    expect(looksMultiplexed(frame(1, 'hello'))).toBe(true);
    expect(looksMultiplexed(frame(2, 'hello'))).toBe(true);
  });

  it('rejects plain text and short buffers', () => {
    expect(looksMultiplexed(Buffer.from('2024-01-15T10:30:00Z hi\n'))).toBe(false);
    expect(looksMultiplexed(Buffer.from([1, 0]))).toBe(false);
  });
});

describe('streamLogs (non-follow buffer path)', () => {
  it('demultiplexes a one-shot Buffer result with stream attribution', async () => {
    const buf = Buffer.concat([
      frame(1, '2024-01-15T10:30:00.000Z out line\n'),
      frame(2, '2024-01-15T10:30:01.000Z err line\n'),
    ]);
    const c = new DockerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (c as any).docker.getContainer = vi.fn().mockReturnValue({ logs: vi.fn().mockResolvedValue(buf) });
    const entries = [];
    for await (const entry of c.streamLogs('abc', { follow: false })) entries.push(entry);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ stream: 'stdout', message: 'out line' });
    expect(entries[1]).toMatchObject({ stream: 'stderr', message: 'err line' });
  });

  it('falls back to plain-text parsing for TTY output', async () => {
    const buf = Buffer.from('plain tty line\nsecond line\n', 'utf8');
    const c = new DockerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (c as any).docker.getContainer = vi.fn().mockReturnValue({ logs: vi.fn().mockResolvedValue(buf) });
    const entries = [];
    for await (const entry of c.streamLogs('abc', { follow: false })) entries.push(entry);
    expect(entries.map(e => e.message)).toEqual(['plain tty line', 'second line']);
    expect(entries.every(e => e.stream === 'stdout')).toBe(true);
  });

  it('strips CRLF from TTY output so timestamps still parse and no \\r leaks', async () => {
    const buf = Buffer.from('2024-01-15T10:30:00.483306929Z tty-a\r\n2024-01-15T10:30:01.000000000Z tty-b\r\n', 'utf8');
    const c = new DockerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (c as any).docker.getContainer = vi.fn().mockReturnValue({ logs: vi.fn().mockResolvedValue(buf) });
    const entries = [];
    for await (const entry of c.streamLogs('abc', { follow: false })) entries.push(entry);
    expect(entries.map(e => e.message)).toEqual(['tty-a', 'tty-b']);
    expect(entries.every(e => e.timestamp !== null)).toBe(true);
  });

  it('getContainerDetails maps restart policy, mounts, health and exit status', async () => {
    const client = new DockerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client as any).docker.getContainer = vi.fn().mockReturnValue({ inspect: vi.fn().mockResolvedValue({
      Config: { Env: ['A=1'] },
      RestartCount: 4,
      HostConfig: { RestartPolicy: { Name: 'on-failure', MaximumRetryCount: 5 } },
      Mounts: [{ Type: 'volume', Name: 'data', Source: '/v', Destination: '/data', RW: false }],
      State: { ExitCode: 137, OOMKilled: true, Error: '', Health: { Status: 'unhealthy', FailingStreak: 2, Log: [{ Start: '2026-01-01T00:00:00Z', ExitCode: 1, Output: 'boom\n' }] } },
    }) });
    const d = await client.getContainerDetails('abc');
    expect(d).toMatchObject({
      env: ['A=1'], restartCount: 4, restartPolicy: { name: 'on-failure', maximumRetryCount: 5 },
      mounts: [{ type: 'volume', name: 'data', destination: '/data', readOnly: true }],
      exitCode: 137, oomKilled: true,
      health: { status: 'unhealthy', failingStreak: 2, log: [{ exitCode: 1, output: 'boom' }] },
    });
    expect(await client.getContainerEnv('abc')).toEqual(['A=1']);
  });

  it('getContainerDetails tolerates a minimal inspect response', async () => {
    const client = new DockerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client as any).docker.getContainer = vi.fn().mockReturnValue({ inspect: vi.fn().mockResolvedValue({ Config: { Env: null } }) });
    expect(await client.getContainerDetails('abc')).toEqual({
      env: [], restartPolicy: { name: 'no', maximumRetryCount: 0 }, restartCount: 0, mounts: [],
      exitCode: 0, oomKilled: false, error: '', health: null,
    });
  });
});
