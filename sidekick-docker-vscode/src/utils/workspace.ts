import * as vscode from 'vscode';
import type { ComposeFileReader } from 'sidekick-docker-shared';

/**
 * Resolve the working directory used for compose file detection and as the
 * fallback cwd for compose actions: the first workspace folder containing a
 * compose file, else the first workspace folder, else undefined (no
 * workspace open — file-based compose detection is skipped entirely).
 */
export async function resolveComposeCwd(reader: ComposeFileReader): Promise<string | undefined> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return undefined;

  for (const folder of folders) {
    const config = await reader.readFromDirectory(folder.uri.fsPath).catch(() => null);
    if (config !== null) return folder.uri.fsPath;
  }
  return folders[0]?.uri.fsPath;
}
