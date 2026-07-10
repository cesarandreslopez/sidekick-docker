import * as vscode from 'vscode';
import { parseDockerEndpoint } from 'sidekick-docker-shared';
import type { DockerClientOptions } from 'sidekick-docker-shared';

/**
 * Single reader of the `sidekick-docker.*` configuration section.
 * Consumers never call `workspace.getConfiguration` directly.
 */
export interface SidekickSettings {
  /** Parsed Docker endpoint; undefined = platform default socket (or DOCKER_HOST). */
  clientOptions: DockerClientOptions | undefined;
  refreshIntervalMs: number;
  statusBarVisible: boolean;
  execShell: string;
}

const MIN_REFRESH_SECONDS = 5;
const DEFAULT_REFRESH_SECONDS = 30;
const DEFAULT_EXEC_SHELL = '/bin/sh';

/**
 * Parse the socketPath setting into DockerClientOptions.
 * Empty → undefined (default socket). Invalid → warn + undefined,
 * rather than silently connecting to the default socket.
 */
export function parseEndpointSetting(
  raw: string,
  warn: (message: string) => void,
): DockerClientOptions | undefined {
  if (raw.trim() === '') return undefined;
  try {
    return parseDockerEndpoint(raw);
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    warn(`Sidekick Docker: ignoring invalid socketPath setting — ${detail}. Using the default Docker socket.`);
    return undefined;
  }
}

export function getSettings(): SidekickSettings {
  const config = vscode.workspace.getConfiguration('sidekick-docker');
  const socketPath = config.get<string>('socketPath', '');
  const refreshSeconds = config.get<number>('refreshIntervalSeconds', DEFAULT_REFRESH_SECONDS);

  return {
    clientOptions: parseEndpointSetting(socketPath, (message) => {
      void vscode.window.showWarningMessage(message);
    }),
    refreshIntervalMs: Math.max(MIN_REFRESH_SECONDS, refreshSeconds) * 1000,
    statusBarVisible: config.get<boolean>('statusBar.visible', true),
    execShell: config.get<string>('exec.defaultShell', DEFAULT_EXEC_SHELL) || DEFAULT_EXEC_SHELL,
  };
}

/**
 * Subscribe to changes of the `sidekick-docker` configuration section.
 * `affected` names the SidekickSettings keys whose backing setting changed.
 */
export function onSettingsChanged(
  cb: (settings: SidekickSettings, affected: Set<keyof SidekickSettings>) => void,
): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((e) => {
    if (!e.affectsConfiguration('sidekick-docker')) return;
    const affected = new Set<keyof SidekickSettings>();
    if (e.affectsConfiguration('sidekick-docker.socketPath')) affected.add('clientOptions');
    if (e.affectsConfiguration('sidekick-docker.refreshIntervalSeconds')) affected.add('refreshIntervalMs');
    if (e.affectsConfiguration('sidekick-docker.statusBar.visible')) affected.add('statusBarVisible');
    if (e.affectsConfiguration('sidekick-docker.exec.defaultShell')) affected.add('execShell');
    cb(getSettings(), affected);
  });
}
