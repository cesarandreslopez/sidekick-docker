import { describe, expect, it } from 'vitest';
import {
  actionText, browserHostForEndpoint, canStart, canStop, publishedPortUrls, pruneCandidateCount,
  pruneConfirmMessage, removeContainerConfirmMessage, sortDirectionLabel,
} from './formatters';
import type { PortBinding } from './types';

describe('canStart / canStop', () => {
  it('offers Start only where Docker accepts it — never on a paused container', () => {
    expect(['exited', 'created'].every(s => canStart(s as never))).toBe(true);
    expect(['running', 'paused', 'restarting', 'dead', 'removing'].some(s => canStart(s as never))).toBe(false);
  });

  it('offers Stop for every state with a live process, paused included', () => {
    expect(['running', 'paused', 'restarting'].every(s => canStop(s as never))).toBe(true);
    expect(['exited', 'created', 'dead'].some(s => canStop(s as never))).toBe(false);
  });
});

describe('prune wording', () => {
  it('counts what each prune removes', () => {
    expect(pruneCandidateCount('containers', [{ state: 'exited' }, { state: 'running' }, { state: 'dead' }, { state: 'created' }])).toBe(3);
    expect(pruneCandidateCount('images', [{ isDangling: true }, { isDangling: false }])).toBe(1);
    expect(pruneCandidateCount('volumes', [{ isInUse: false }, { isInUse: true }])).toBe(1);
    expect(pruneCandidateCount('networks', [{ isDefault: true, containers: [] }, { isDefault: false, containers: [] }, { isDefault: false, containers: [1] }])).toBe(1);
  });

  it('names the count, with a fallback when it is unknown', () => {
    expect(pruneConfirmMessage('containers', 1)).toBe('Remove 1 stopped container?');
    expect(pruneConfirmMessage('images', 3)).toBe('Prune 3 dangling images?');
    expect(pruneConfirmMessage('volumes', 0)).toBe('Prune all unused volumes?');
  });

  it('warns when removing a container will stop it first', () => {
    expect(removeContainerConfirmMessage({ name: 'web', state: 'running' })).toBe('Force-remove running container "web"? It will be stopped first.');
    expect(removeContainerConfirmMessage({ name: 'old', state: 'exited' })).toBe('Remove container "old"?');
  });
});

describe('sortDirectionLabel', () => {
  it('describes the actual order per field', () => {
    expect(sortDirectionLabel('name', false)).toBe('A→Z');
    expect(sortDirectionLabel('name', true)).toBe('Z→A');
    expect(sortDirectionLabel('cpu', false)).toBe('highest first');
    expect(sortDirectionLabel('pids', true)).toBe('lowest first');
    expect(sortDirectionLabel('state', false)).toBe('running first');
  });
});

describe('publishedPortUrls', () => {
  const port = (hostPort: number, containerPort: number, hostIp = '0.0.0.0', protocol: 'tcp' | 'udp' = 'tcp'): PortBinding => ({ hostIp, hostPort, containerPort, protocol });

  it('yields one URL per published TCP port, deduping IPv4/IPv6 bindings', () => {
    expect(publishedPortUrls([port(8080, 80), port(8080, 80, '::'), port(53, 53, '0.0.0.0', 'udp'), port(0, 9000)], 'localhost'))
      .toEqual(['http://localhost:8080']);
  });

  it('uses https for TLS ports and the bound address when it is specific', () => {
    expect(publishedPortUrls([port(8443, 443), port(3000, 3000, '192.168.1.5')], 'docker.local'))
      .toEqual(['https://docker.local:8443', 'http://192.168.1.5:3000']);
  });

  it('brackets IPv6 hosts', () => {
    expect(publishedPortUrls([port(80, 80)], 'fe80::1')).toEqual(['http://[fe80::1]:80']);
  });
});

describe('browserHostForEndpoint', () => {
  it('uses the remote daemon host, or localhost for local sockets', () => {
    expect(browserHostForEndpoint('tcp://10.0.0.2:2375')).toBe('10.0.0.2');
    expect(browserHostForEndpoint('ssh://me@build-box')).toBe('build-box');
    expect(browserHostForEndpoint('tcp://[::1]:2375')).toBe('::1');
    expect(browserHostForEndpoint('unix:///var/run/docker.sock')).toBe('localhost');
    expect(browserHostForEndpoint(undefined)).toBe('localhost');
  });
});

describe('actionText', () => {
  it('words progress and success the same way on both surfaces', () => {
    expect(actionText('stop', 'web')).toEqual({ progress: 'Stopping web…', success: 'Stopped web' });
    expect(actionText('up', 'shop')).toEqual({ progress: 'Bringing shop up…', success: 'shop is up' });
  });
});
