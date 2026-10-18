import { describe, expect, it, vi } from 'vitest';
import { ComposeFileReader } from './ComposeFileReader';
import { TIMEOUT_EXIT_CODE } from './process';

const CONFIG = JSON.stringify({
  name: 'shop',
  services: {
    web: { image: 'nginx', ports: [{ published: '8080', target: 80, protocol: 'tcp' }] },
    api: { build: { context: '.' }, ports: ['3000:3000'] },
  },
});

function reader(result: { exitCode: number; stdout?: string; stderr?: string } | Error) {
  const run = vi.fn(() => result instanceof Error
    ? Promise.reject(result)
    : Promise.resolve({ stdout: '', stderr: '', ...result }));
  return { run, reader: new ComposeFileReader({ DOCKER_HOST: 'tcp://remote:2375' }, { run, timeoutMs: 1234 }) };
}

describe('ComposeFileReader', () => {
  it('parses services and passes cwd, env and the deadline to the runner', async () => {
    const { run, reader: r } = reader({ exitCode: 0, stdout: CONFIG });
    const config = await r.readFromDirectory('/app');
    expect(config).toEqual({
      projectName: 'shop',
      services: [
        { name: 'web', image: 'nginx', hasBuild: false, ports: ['8080:80/tcp'] },
        { name: 'api', image: undefined, hasBuild: true, ports: ['3000:3000'] },
      ],
    });
    expect(run).toHaveBeenCalledWith('docker', ['compose', 'config', '--format', 'json'], expect.objectContaining({
      cwd: '/app', env: { DOCKER_HOST: 'tcp://remote:2375' }, timeoutMs: 1234,
    }));
  });

  it('treats a non-zero exit as a definite "no project"', async () => {
    const { reader: r } = reader({ exitCode: 1, stderr: 'no configuration file provided' });
    expect(await r.read('/app')).toEqual({ config: null, transient: false });
  });

  it('treats invalid JSON as no project rather than throwing', async () => {
    const { reader: r } = reader({ exitCode: 0, stdout: '{not json' });
    expect(await r.read('/app')).toEqual({ config: null, transient: false });
  });

  it('marks a timeout as transient so it is retried later', async () => {
    const { reader: r } = reader({ exitCode: TIMEOUT_EXIT_CODE, stderr: 'docker compose timed out after 10s' });
    expect(await r.read('/app')).toEqual({ config: null, transient: true });
  });

  it('marks a missing docker binary as permanent and other spawn errors as transient', async () => {
    const enoent = Object.assign(new Error('spawn docker ENOENT'), { code: 'ENOENT' });
    expect(await reader(enoent).reader.read('/app')).toEqual({ config: null, transient: false });
    const eagain = Object.assign(new Error('spawn EAGAIN'), { code: 'EAGAIN' });
    expect(await reader(eagain).reader.read('/app')).toEqual({ config: null, transient: true });
  });
});
