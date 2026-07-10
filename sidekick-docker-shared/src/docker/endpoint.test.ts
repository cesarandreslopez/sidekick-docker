import { describe, it, expect, afterEach } from 'vitest';
import { parseDockerEndpoint, describeDockerEndpoint } from './endpoint';

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
