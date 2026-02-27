import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DockerClient } from './DockerClient';

// Mock dockerode
vi.mock('dockerode', () => {
  return {
    default: vi.fn().mockImplementation(function () {
      return {
        ping: vi.fn().mockResolvedValue('OK'),
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
});
