import * as vscode from 'vscode';
import { parseDockerEndpoint, dockerCliEnv } from 'sidekick-docker-shared';
import type { DockerClientOptions } from 'sidekick-docker-shared';

/**
 * Single reader of the `sidekick-docker.*` configuration section.
 * Consumers never call `workspace.getConfiguration` directly.
 */
export interface SidekickSettings {
  /** Parsed Docker endpoint; undefined = platform default socket (or DOCKER_HOST). */
  clientOptions: DockerClientOptions | undefined;
  /**
   * Environment overrides that point a spawned `docker` process at the same
   * endpoint as the API client. Subprocesses cannot see dockerode's
   * configuration, so without these the socketPath setting is ignored by
   * `docker compose` and by the exec terminal.
   * Undefined when the default socket is in use.
   */
  cliEnv: Record<string, string> | undefined;
  refreshIntervalMs: number;
  statusBarVisible: boolean;
  execShell: string;
  /**
   * The endpoint setting in effect (trimmed; '' = default), for describing the
   * endpoint in errors. An invalid value is '' too: it is ignored, and the
   * default socket is what actually gets used.
   */
  socketPath: string;
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

/**
 * Read the settings. No side effects: this runs on every container change
 * (the status bar describes the endpoint), so it must not show the invalid
 * socketPath warning itself — see warnIfInvalidEndpoint.
 */
export function getSettings(): SidekickSettings {
  const config = vscode.workspace.getConfiguration('sidekick-docker');
  const socketPath = config.get<string>('socketPath', '');
  const refreshSeconds = config.get<number>('refreshIntervalSeconds', DEFAULT_REFRESH_SECONDS);

  const clientOptions = parseEndpointSetting(socketPath, () => { /* reported by warnIfInvalidEndpoint */ });

  return {
    clientOptions,
    // Only when the setting parsed cleanly — an invalid value falls back to
    // the default socket, and the CLI must follow it there.
    cliEnv: clientOptions ? dockerCliEnv(socketPath.trim()) : undefined,
    refreshIntervalMs: Math.max(MIN_REFRESH_SECONDS, refreshSeconds) * 1000,
    statusBarVisible: config.get<boolean>('statusBar.visible', true),
    execShell: config.get<string>('exec.defaultShell', DEFAULT_EXEC_SHELL) || DEFAULT_EXEC_SHELL,
    socketPath: clientOptions ? socketPath.trim() : '',
  };
}

/** The invalid socketPath value already warned about, so each value warns once. */
let warnedEndpoint: string | null = null;

/**
 * Warn once per invalid socketPath value. Called at activation, when the
 * setting changes and when the workspace is trusted (which can change it).
 */
export function warnIfInvalidEndpoint(): void {
  const raw = vscode.workspace.getConfiguration('sidekick-docker').get<string>('socketPath', '');
  let message: string | undefined;
  parseEndpointSetting(raw, (m) => { message = m; });
  if (message === undefined) {
    warnedEndpoint = null;
    return;
  }
  if (raw === warnedEndpoint) return;
  warnedEndpoint = raw;
  // Straight to the setting: the warning used to name it and leave finding it to you.
  void vscode.window.showWarningMessage(message, OPEN_SETTINGS).then((choice) => {
    if (choice === OPEN_SETTINGS) void vscode.commands.executeCommand('workbench.action.openSettings', 'sidekick-docker.socketPath');
  });
}

const OPEN_SETTINGS = 'Open Settings';

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
