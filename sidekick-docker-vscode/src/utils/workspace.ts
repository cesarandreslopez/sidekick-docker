import * as vscode from 'vscode';
import type { ComposeFileReader } from 'sidekick-docker-shared';

/**
 * Resolve the working directory used for compose file detection and as the
 * fallback cwd for compose actions: the first workspace folder containing a
 * compose file, else the first workspace folder, else undefined (no
 * workspace open — file-based compose detection is skipped entirely).
 *
 * Returns undefined in an untrusted workspace. `docker compose config` reads
 * and interpolates the workspace's own compose file, and the directory it
 * resolves becomes the cwd for `docker compose up` — which executes that
 * file. The manifest declares `untrustedWorkspaces: "limited"`; this is where
 * the limit is enforced.
 */
export async function resolveComposeCwd(reader: ComposeFileReader): Promise<string | undefined> {
  if (!vscode.workspace.isTrusted) return undefined;

  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return undefined;

  for (const folder of folders) {
    const config = await reader.readFromDirectory(folder.uri.fsPath).catch(() => null);
    if (config !== null) return folder.uri.fsPath;
  }
  return folders[0]?.uri.fsPath;
}
