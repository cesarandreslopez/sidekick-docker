import { describe, expect, it } from 'vitest';
import type { ContainerInfo } from 'sidekick-docker-shared';
import { runningCount, statusBarView } from './statusBar';

function container(state: ContainerInfo['state'], healthStatus?: ContainerInfo['healthStatus']): ContainerInfo {
  return { id: state, name: state, image: 'img', state, status: '', ports: [], created: new Date(0), healthStatus };
}

describe('statusBarView', () => {
  it('says connecting, with a spinner and no warning background, until the first connect settles', () => {
    const view = statusBarView({ kind: 'connecting' }, 'unix:///var/run/docker.sock');
    expect(view.text).toBe('$(sync~spin) Docker');
    expect(view.warning).toBe(false);
    expect(view.tooltip).toContain('connecting to unix:///var/run/docker.sock');
  });

  it('warns only for a daemon that is really offline, and says why', () => {
    const view = statusBarView({ kind: 'offline', reason: 'Permission denied.' }, 'ep');
    expect(view).toMatchObject({ text: '$(warning) Docker offline', warning: true, label: 'Sidekick Docker: Docker offline. Permission denied.' });
    expect(view.tooltip).toContain('Permission denied.');
  });

  it('counts running the way the running-only toggle does (paused and restarting included)', () => {
    const containers = [container('running'), container('paused'), container('restarting'), container('exited'), container('running', 'unhealthy')];
    expect(runningCount(containers)).toBe(4);
    const view = statusBarView({ kind: 'connected', containers }, 'ep');
    expect(view.text).toBe('$(package) 4/5 $(warning) 1');
    expect(view.warning).toBe(false);
    expect(view.label).toBe('Sidekick Docker: 4 of 5 containers running, 1 unhealthy');
  });
});
