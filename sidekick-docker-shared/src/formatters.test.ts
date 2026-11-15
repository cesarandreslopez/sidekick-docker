import { describe, expect, it } from 'vitest';
import {
  actionText, actionFailedText, browserHostForEndpoint, canStart, canStop, matchesRunningOnly, publishedPortUrls, pruneCandidateCount,
  pruneConfirmMessage, pruneConfirmFor, pruneResultText, removeContainerConfirmMessage, sortDirectionLabel, summarizeRestartPolicy,
  formatMount, summarizeHealth, imageDisplayName, removeImageConfirmMessage, composeDownConfirmMessage,
  removeVolumeConfirmMessage, removeNetworkConfirmMessage,
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

  it('counts only anonymous volumes where the daemon prunes only those (Engine 23+)', () => {
    const vols = [
      { isInUse: false, anonymous: true, pruneScope: 'anonymous' as const },
      { isInUse: false, anonymous: false, pruneScope: 'anonymous' as const },
      { isInUse: true, anonymous: true, pruneScope: 'anonymous' as const },
    ];
    expect(pruneCandidateCount('volumes', vols)).toBe(1);
    expect(pruneConfirmFor('volumes', vols)).toBe('Prune 1 unused anonymous volume? Named volumes are kept.');
  });

  it('counts every unused volume on an older daemon, and names no count when the version is unknown', () => {
    const old = [{ isInUse: false, anonymous: false, pruneScope: 'all' as const }, { isInUse: false, anonymous: true, pruneScope: 'all' as const }];
    expect(pruneConfirmFor('volumes', old)).toBe('Prune 2 unused volumes?');
    const unknown = [{ isInUse: false, anonymous: false, pruneScope: 'unknown' as const }];
    expect(pruneConfirmFor('volumes', unknown)).toBe('Prune unused volumes?');
    expect(pruneConfirmFor('volumes', [])).toBe('Prune unused volumes?');
  });

  it('pruneConfirmFor matches pruneConfirmMessage for the other kinds', () => {
    expect(pruneConfirmFor('images', [{ isDangling: true }, { isDangling: true }])).toBe('Prune 2 dangling images?');
    expect(pruneConfirmFor('containers', [{ state: 'exited' }])).toBe('Remove 1 stopped container?');
  });

  it('words prune results the same on both surfaces', () => {
    expect(pruneResultText('images', { spaceReclaimed: 0 })).toBe('Pruned images — 0 B reclaimed');
    expect(pruneResultText('volumes', { spaceReclaimed: 2048 })).toBe('Pruned volumes — 2.0 KB reclaimed');
    expect(pruneResultText('containers', { spaceReclaimed: 0, deleted: 1 })).toBe('Pruned 1 container — 0 B reclaimed');
    expect(pruneResultText('networks', { deleted: 2 })).toBe('Pruned 2 networks');
    expect(pruneResultText('networks', { deleted: 0 })).toBe('No unused networks to prune');
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

describe('container detail summaries', () => {
  it('summarizes the restart policy', () => {
    expect(summarizeRestartPolicy({ name: 'unless-stopped', maximumRetryCount: 0 })).toBe('unless-stopped');
    expect(summarizeRestartPolicy({ name: 'on-failure', maximumRetryCount: 5 }, 2)).toBe('on-failure (max 5) · restarted 2×');
    expect(summarizeRestartPolicy({ name: '', maximumRetryCount: 0 })).toBe('no');
  });

  it('formats mounts', () => {
    expect(formatMount({ type: 'volume', name: 'pgdata', source: '/var/lib/docker/volumes/pgdata/_data', destination: '/data', readOnly: false })).toBe('pgdata → /data (volume)');
    expect(formatMount({ type: 'bind', source: '/srv/conf', destination: '/etc/app', readOnly: true })).toBe('/srv/conf → /etc/app (bind, ro)');
  });

  it('explains an unhealthy container from its last probe', () => {
    const health = { status: 'unhealthy', failingStreak: 3, log: [{ exitCode: 0, output: 'ok' }, { exitCode: 7, output: 'curl: (7) Failed to connect\n' }] };
    expect(summarizeHealth(health)).toEqual(['unhealthy · 3 failing checks in a row', 'Last check: exit 7 — curl: (7) Failed to connect']);
    expect(summarizeHealth({ status: 'healthy', failingStreak: 0, log: [] })).toEqual(['healthy']);
    expect(summarizeHealth(null)).toEqual([]);
  });
});

describe('image naming and removal wording', () => {
  it('tells untagged images apart by id', () => {
    expect(imageDisplayName({ id: 'abc123def456', repoTags: ['nginx:latest'] })).toBe('nginx:latest');
    expect(imageDisplayName({ id: 'abc123def456', repoTags: ['<none>:<none>'] })).toBe('<none> (abc123def456)');
    expect(imageDisplayName({ id: 'abc123def456', repoTags: [] })).toBe('<none> (abc123def456)');
  });

  it('says every tag goes with the image', () => {
    expect(removeImageConfirmMessage({ id: 'abc', repoTags: ['app:latest'] })).toBe('Remove image "app:latest"?');
    expect(removeImageConfirmMessage({ id: 'abc', repoTags: ['app:latest', 'app:1.2'] })).toBe('Remove image "app:latest" and 1 other tag (app:1.2)?');
    expect(removeImageConfirmMessage({ id: 'abc', repoTags: ['a:1', 'a:2', 'a:3', 'a:4'] })).toBe('Remove image "a:1" and 3 other tags (a:2, a:3, …)?');
    expect(removeImageConfirmMessage({ id: 'abc123', repoTags: ['<none>:<none>'] })).toBe('Remove untagged image abc123?');
  });
});

describe('shared confirm and failure wording', () => {
  it('says what compose down removes and keeps', () => {
    expect(composeDownConfirmMessage('shop')).toBe('Take compose project "shop" down? Its containers and networks are removed (volumes are kept).');
  });

  it('names the volume or network being removed', () => {
    expect(removeVolumeConfirmMessage('pgdata')).toBe('Remove volume "pgdata"? Its data is deleted.');
    expect(removeNetworkConfirmMessage('backend')).toBe('Remove network "backend"?');
  });

  it('words failures with the target name', () => {
    expect(actionFailedText('stop', 'web', 'timeout')).toBe('Failed to stop web: timeout');
    expect(actionFailedText('down', 'shop', 'boom')).toBe('Failed to take shop down: boom');
    expect(actionFailedText('up', 'shop', 'boom')).toBe('Failed to bring shop up: boom');
  });

  it('keeps every container with a live process under "running only"', () => {
    expect(['running', 'paused', 'restarting'].every(s => matchesRunningOnly(s as never))).toBe(true);
    expect(['exited', 'created', 'dead'].some(s => matchesRunningOnly(s as never))).toBe(false);
  });
});
