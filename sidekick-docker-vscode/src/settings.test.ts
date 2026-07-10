import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSettings, parseEndpointSetting } from './settings';
import { __mock } from './test/vscode';

describe('parseEndpointSetting', () => {
  it('returns undefined for empty input without warning', () => {
    const warn = vi.fn();
    expect(parseEndpointSetting('', warn)).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it('returns undefined for whitespace-only input without warning', () => {
    const warn = vi.fn();
    expect(parseEndpointSetting('   ', warn)).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it('parses a bare socket path', () => {
    const warn = vi.fn();
    expect(parseEndpointSetting('/var/run/docker.sock', warn)).toEqual({ socketPath: '/var/run/docker.sock' });
    expect(warn).not.toHaveBeenCalled();
  });

  it('parses unix:// endpoints', () => {
    const warn = vi.fn();
    expect(parseEndpointSetting('unix:///run/user/1000/docker.sock', warn)).toEqual({
      socketPath: '/run/user/1000/docker.sock',
    });
  });

  it('parses tcp://host:port endpoints', () => {
    const warn = vi.fn();
    expect(parseEndpointSetting('tcp://localhost:2375', warn)).toEqual({
      host: 'localhost',
      port: 2375,
      protocol: 'http',
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it('defaults tcp:// endpoints without a port to 2375', () => {
    const warn = vi.fn();
    expect(parseEndpointSetting('tcp://dockerhost', warn)).toEqual({
      host: 'dockerhost',
      port: 2375,
      protocol: 'http',
    });
  });

  it('warns and returns undefined for invalid endpoints', () => {
    const warn = vi.fn();
    expect(parseEndpointSetting('ftp://nope', warn)).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('invalid socketPath');
  });

  it('warns and returns undefined for tcp:// without a host', () => {
    const warn = vi.fn();
    expect(parseEndpointSetting('tcp://', warn)).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('getSettings', () => {
  beforeEach(() => {
    __mock.reset();
  });

  it('returns defaults when nothing is configured', () => {
    const settings = getSettings();
    expect(settings.clientOptions).toBeUndefined();
    expect(settings.refreshIntervalMs).toBe(30_000);
    expect(settings.statusBarVisible).toBe(true);
    expect(settings.execShell).toBe('/bin/sh');
    expect(__mock.warningMessages).toHaveLength(0);
  });

  it('parses a configured tcp:// socketPath', () => {
    __mock.configValues.set('sidekick-docker.socketPath', 'tcp://dockerhost:2376');
    expect(getSettings().clientOptions).toEqual({ host: 'dockerhost', port: 2376, protocol: 'https' });
  });

  it('converts refreshIntervalSeconds to milliseconds', () => {
    __mock.configValues.set('sidekick-docker.refreshIntervalSeconds', 60);
    expect(getSettings().refreshIntervalMs).toBe(60_000);
  });

  it('clamps refreshIntervalSeconds to the 5s minimum', () => {
    __mock.configValues.set('sidekick-docker.refreshIntervalSeconds', 1);
    expect(getSettings().refreshIntervalMs).toBe(5_000);
  });

  it('shows a warning and falls back to the default socket for an invalid socketPath', () => {
    __mock.configValues.set('sidekick-docker.socketPath', 'tcp://');
    const settings = getSettings();
    expect(settings.clientOptions).toBeUndefined();
    expect(__mock.warningMessages).toHaveLength(1);
  });

  it('reads statusBar.visible and exec.defaultShell', () => {
    __mock.configValues.set('sidekick-docker.statusBar.visible', false);
    __mock.configValues.set('sidekick-docker.exec.defaultShell', '/bin/bash');
    const settings = getSettings();
    expect(settings.statusBarVisible).toBe(false);
    expect(settings.execShell).toBe('/bin/bash');
  });

  it('falls back to /bin/sh when exec.defaultShell is empty', () => {
    __mock.configValues.set('sidekick-docker.exec.defaultShell', '');
    expect(getSettings().execShell).toBe('/bin/sh');
  });
});
