import { beforeEach, describe, expect, it } from 'vitest';
import { ACTION_META, runDockerAction } from './actionRegistry';
import { __mock, ProgressLocation } from '../test/vscode';

describe('ACTION_META', () => {
  it('covers every dashboard action type', () => {
    expect(Object.keys(ACTION_META).sort()).toEqual(
      ['down', 'pause', 'prune', 'remove', 'restart', 'start', 'stop', 'unpause', 'up'],
    );
  });

  it('maps progress and success labels per action', () => {
    expect(ACTION_META.start.progressTitle('web-1')).toBe('Starting web-1…');
    expect(ACTION_META.start.successMessage('web-1')).toBe('Started web-1');
    expect(ACTION_META.stop.progressTitle('web-1')).toBe('Stopping web-1…');
    expect(ACTION_META.stop.successMessage('web-1')).toBe('Stopped web-1');
    expect(ACTION_META.restart.successMessage('web-1')).toBe('Restarted web-1');
    expect(ACTION_META.pause.successMessage('web-1')).toBe('Paused web-1');
    expect(ACTION_META.unpause.successMessage('web-1')).toBe('Unpaused web-1');
    expect(ACTION_META.remove.successMessage('web-1')).toBe('Removed web-1');
    expect(ACTION_META.up.progressTitle('myproj')).toBe('Bringing myproj up…');
    expect(ACTION_META.down.progressTitle('myproj')).toBe('Taking myproj down…');
    expect(ACTION_META.prune.successMessage('images')).toBe('Pruned images');
  });

  it('flags slow operations (SIGTERM path / compose spawns) and fast ones', () => {
    for (const slow of ['stop', 'restart', 'remove', 'up', 'down', 'prune']) {
      expect(ACTION_META[slow].slow, slow).toBe(true);
    }
    for (const fast of ['start', 'pause', 'unpause']) {
      expect(ACTION_META[fast].slow, fast).toBe(false);
    }
  });
});

describe('runDockerAction', () => {
  beforeEach(() => {
    __mock.reset();
  });

  it('runs fast actions without a progress notification', async () => {
    let ran = false;
    await runDockerAction(ACTION_META.start, 'web-1', async () => {
      ran = true;
    });
    expect(ran).toBe(true);
    expect(__mock.progressCalls).toHaveLength(0);
  });

  it('wraps slow actions in a progress notification', async () => {
    let ran = false;
    await runDockerAction(ACTION_META.stop, 'web-1', async () => {
      ran = true;
    });
    expect(ran).toBe(true);
    expect(__mock.progressCalls).toEqual([
      { location: ProgressLocation.Notification, title: 'Stopping web-1…' },
    ]);
  });

  it('rethrows errors from fast actions', async () => {
    await expect(
      runDockerAction(ACTION_META.pause, 'web-1', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
  });

  it('rethrows errors from slow actions', async () => {
    await expect(
      runDockerAction(ACTION_META.remove, 'web-1', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
  });
});
