import { describe, it, expect, afterEach } from 'vitest';
import { parseDockerEndpoint, describeDockerEndpoint, dockerCliEnv } from './endpoint';
import { DockerClient } from './DockerClient';

describe('parseDockerEndpoint', () => {
  it('treats a bare path as a socket path', () => {
    expect(parseDockerEndpoint('/var/run/docker.sock')).toEqual({ socketPath: '/var/run/docker.sock' });
  });

  it('parses unix:// URLs', () => {
    expect(parseDockerEndpoint('unix:///run/user/1000/docker.sock')).toEqual({ socketPath: '/run/user/1000/docker.sock' });
  });

  it('parses tcp:// with an explicit port', () => {
    expect(parseDockerEndpoint('tcp://192.168.1.100:2375')).toEqual({ host: '192.168.1.100', port: 2375, protocol: 'http' });
  });

  it('defaults tcp:// to port 2375 / http', () => {
    expect(parseDockerEndpoint('tcp://dockerhost')).toEqual({ host: 'dockerhost', port: 2375, protocol: 'http' });
  });

  it('infers https from port 2376', () => {
    expect(parseDockerEndpoint('tcp://dockerhost:2376')).toEqual({ host: 'dockerhost', port: 2376, protocol: 'https' });
  });

  it('parses https:// with default TLS port', () => {
    expect(parseDockerEndpoint('https://dockerhost')).toEqual({ host: 'dockerhost', port: 2376, protocol: 'https' });
  });

  it('parses http:// with a custom port', () => {
    expect(parseDockerEndpoint('http://dockerhost:12345')).toEqual({ host: 'dockerhost', port: 12345, protocol: 'http' });
  });

  it('keeps an explicit http:// on port 2376 plain HTTP (no TLS inference)', () => {
    expect(parseDockerEndpoint('http://dockerhost:2376')).toEqual({ host: 'dockerhost', port: 2376, protocol: 'http' });
  });

  it('trims surrounding whitespace', () => {
    expect(parseDockerEndpoint('  /var/run/docker.sock  ')).toEqual({ socketPath: '/var/run/docker.sock' });
  });

  it('throws on empty input', () => {
    expect(() => parseDockerEndpoint('')).toThrow(/must not be empty/);
    expect(() => parseDockerEndpoint('   ')).toThrow(/must not be empty/);
  });

  it('throws on unix:// with no path', () => {
    expect(() => parseDockerEndpoint('unix://')).toThrow(/missing socket path/);
  });

  it('throws on tcp:// with no host', () => {
    expect(() => parseDockerEndpoint('tcp://')).toThrow(/Invalid Docker endpoint/);
  });

  it('throws on unsupported schemes', () => {
    expect(() => parseDockerEndpoint('ssh://dockerhost')).toThrow(/unsupported scheme/);
  });
});

describe('dockerCliEnv', () => {
  it('maps a bare socket path to a unix:// DOCKER_HOST', () => {
    expect(dockerCliEnv('/run/user/1000/podman.sock')).toEqual({ DOCKER_HOST: 'unix:///run/user/1000/podman.sock' });
  });

  it('maps unix:// URLs through unchanged', () => {
    expect(dockerCliEnv('unix:///var/run/docker.sock')).toEqual({ DOCKER_HOST: 'unix:///var/run/docker.sock' });
  });

  it('maps tcp:// endpoints with an explicit port', () => {
    expect(dockerCliEnv('tcp://staging:2375')).toEqual({ DOCKER_HOST: 'tcp://staging:2375' });
  });

  it('adds the default port when omitted', () => {
    expect(dockerCliEnv('tcp://staging')).toEqual({ DOCKER_HOST: 'tcp://staging:2375' });
  });

  it('sets DOCKER_TLS_VERIFY for TLS endpoints', () => {
    expect(dockerCliEnv('https://secure')).toEqual({ DOCKER_HOST: 'tcp://secure:2376', DOCKER_TLS_VERIFY: '1' });
    expect(dockerCliEnv('tcp://secure:2376')).toEqual({ DOCKER_HOST: 'tcp://secure:2376', DOCKER_TLS_VERIFY: '1' });
  });

  it('does not set DOCKER_TLS_VERIFY for explicit http://', () => {
    expect(dockerCliEnv('http://plain:2376')).toEqual({ DOCKER_HOST: 'tcp://plain:2376' });
  });

  it('maps Windows named pipes to the npipe:// form the docker CLI accepts', () => {
    expect(dockerCliEnv('\\\\.\\pipe\\docker_engine')).toEqual({ DOCKER_HOST: 'npipe:////./pipe/docker_engine' });
  });
});

// Uses the REAL dockerode (no module mock in this file): docker-modem merges
// DOCKER_HOST-derived defaults into the options and prefers host over
// socketPath, so this guards the constructor's explicit-undefined pinning.
describe('DockerClient endpoint pinning', () => {
  const originalDockerHost = process.env.DOCKER_HOST;

  afterEach(() => {
    if (originalDockerHost === undefined) delete process.env.DOCKER_HOST;
    else process.env.DOCKER_HOST = originalDockerHost;
  });

  it('an explicit socketPath wins over an ambient DOCKER_HOST', () => {
    process.env.DOCKER_HOST = 'tcp://remote-daemon:2375';
    const client = new DockerClient(parseDockerEndpoint('/my/explicit/podman.sock'));
    const modem = (client as unknown as { docker: { modem: { socketPath?: string; host?: string; protocol?: string } } }).docker.modem;
    expect(modem.socketPath).toBe('/my/explicit/podman.sock');
    expect(modem.host).toBeUndefined();
  });

  it('does not pick up https from a TLS DOCKER_HOST when dialing a socket', () => {
    process.env.DOCKER_HOST = 'tcp://remote-daemon:2376';
    const client = new DockerClient(parseDockerEndpoint('unix:///tmp/docker.sock'));
    const modem = (client as unknown as { docker: { modem: { socketPath?: string; protocol?: string } } }).docker.modem;
    expect(modem.socketPath).toBe('/tmp/docker.sock');
    expect(modem.protocol).toBe('http');
  });

  it('an explicit host/port endpoint still overrides DOCKER_HOST', () => {
    process.env.DOCKER_HOST = 'tcp://other:2375';
    const client = new DockerClient(parseDockerEndpoint('tcp://mine:2375'));
    const modem = (client as unknown as { docker: { modem: { host?: string } } }).docker.modem;
    expect(modem.host).toBe('mine');
  });
});

describe('describeDockerEndpoint', () => {
  const originalDockerHost = process.env.DOCKER_HOST;

  afterEach(() => {
    if (originalDockerHost === undefined) delete process.env.DOCKER_HOST;
    else process.env.DOCKER_HOST = originalDockerHost;
  });

  it('returns the explicit value when given', () => {
    expect(describeDockerEndpoint('tcp://h:2375')).toBe('tcp://h:2375');
  });

  it('mentions DOCKER_HOST when set and no explicit value', () => {
    process.env.DOCKER_HOST = 'tcp://remote:2375';
    expect(describeDockerEndpoint()).toBe('tcp://remote:2375 (from DOCKER_HOST)');
  });

  it('falls back to the default socket description', () => {
    delete process.env.DOCKER_HOST;
    expect(describeDockerEndpoint()).toBe('the default Docker socket (/var/run/docker.sock)');
  });
});
