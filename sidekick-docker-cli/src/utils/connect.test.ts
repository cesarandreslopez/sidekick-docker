import { describe, it, expect, vi, beforeEach } from 'vitest';
import { connectOrExit } from './connect';

const mocks = vi.hoisted(() => ({
  pingDetailed: vi.fn(),
  ctorArgs: [] as unknown[],
}));

vi.mock('sidekick-docker-shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('sidekick-docker-shared')>();
  return {
    ...actual,
    DockerClient: class {
      constructor(opts?: unknown) {
        mocks.ctorArgs.push(opts);
      }
      pingDetailed = mocks.pingDetailed;
    },
  };
});

describe('connectOrExit', () => {
  beforeEach(() => {
    mocks.pingDetailed.mockReset();
    mocks.ctorArgs.length = 0;
    vi.restoreAllMocks();
  });

  it('returns the client when the daemon responds', async () => {
    mocks.pingDetailed.mockResolvedValue({ ok: true });
    const client = await connectOrExit({});
    expect(client).toBeDefined();
    expect(mocks.ctorArgs).toEqual([undefined]); // lets docker-modem honor DOCKER_HOST
  });

  it('parses --socket into DockerClient options', async () => {
    mocks.pingDetailed.mockResolvedValue({ ok: true });
    await connectOrExit({ socket: 'tcp://example.com:2375' });
    expect(mocks.ctorArgs).toEqual([{ host: 'example.com', port: 2375, protocol: 'http' }]);

    await connectOrExit({ socket: '/run/user/1000/docker.sock' });
    expect(mocks.ctorArgs[1]).toEqual({ socketPath: '/run/user/1000/docker.sock' });
  });

  it('prints an actionable one-liner and exits 1 when unreachable', async () => {
    const enoent = Object.assign(new Error('connect ENOENT /bad/path'), { code: 'ENOENT' });
    mocks.pingDetailed.mockResolvedValue({ ok: false, error: enoent });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);

    await expect(connectOrExit({ socket: '/bad/path' })).rejects.toThrow('exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalledWith(
      'Error: Docker socket not found at /bad/path. Is Docker installed and running? Point elsewhere with --socket or DOCKER_HOST.',
    );
  });

  it('describes the default endpoint when --socket is not given', async () => {
    const refused = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    mocks.pingDetailed.mockResolvedValue({ ok: false, error: refused });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);
    const savedHost = process.env.DOCKER_HOST;
    delete process.env.DOCKER_HOST;

    try {
      await expect(connectOrExit({})).rejects.toThrow('exit');
      expect(errorSpy).toHaveBeenCalledWith(
        'Error: Connection refused at the default Docker socket (/var/run/docker.sock). Is the Docker daemon running?',
      );
    } finally {
      if (savedHost !== undefined) process.env.DOCKER_HOST = savedHost;
    }
  });
});
