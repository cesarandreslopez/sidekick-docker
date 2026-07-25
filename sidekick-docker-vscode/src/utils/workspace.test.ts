import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { ComposeFileReader } from 'sidekick-docker-shared';
import * as vscode from 'vscode';
import { resolveComposeCwd } from './workspace';

/**
 * `resolveComposeCwd` is the trust gate for compose. The manifest declares
 * `capabilities.untrustedWorkspaces: "limited"`, which keeps the extension
 * enabled in Restricted Mode — so the limit has to be enforced here, or
 * `docker compose config`/`up` would run against a compose file belonging to
 * a workspace the user explicitly declined to trust.
 */
/**
 * `workspaceFolders` and `isTrusted` are readonly on the real `@types/vscode`,
 * which is what `tsc --noEmit` resolves; only the vitest alias swaps in the
 * mutable test double. Seed through this view so both agree.
 */
const ws = vscode.workspace as unknown as {
  workspaceFolders: { uri: { fsPath: string } }[] | undefined;
  isTrusted: boolean;
};

describe('resolveComposeCwd', () => {
  const reader = {
    readFromDirectory: async () => ({}),
  } as unknown as ComposeFileReader;

  beforeEach(() => {
    ws.workspaceFolders = [{ uri: { fsPath: '/work/project' } }];
    ws.isTrusted = true;
  });

  afterEach(() => {
    ws.workspaceFolders = undefined;
    ws.isTrusted = true;
  });

  it('resolves the folder holding a compose file when the workspace is trusted', async () => {
    await expect(resolveComposeCwd(reader)).resolves.toBe('/work/project');
  });

  it('returns undefined in an untrusted workspace', async () => {
    ws.isTrusted = false;
    await expect(resolveComposeCwd(reader)).resolves.toBeUndefined();
  });

  it('does not even read the workspace directory when untrusted', async () => {
    let reads = 0;
    const counting = {
      readFromDirectory: async () => { reads++; return {}; },
    } as unknown as ComposeFileReader;

    ws.isTrusted = false;
    await resolveComposeCwd(counting);
    expect(reads).toBe(0);
  });

  it('returns undefined when no workspace is open', async () => {
    ws.workspaceFolders = undefined;
    await expect(resolveComposeCwd(reader)).resolves.toBeUndefined();
  });

  it('falls back to the first folder when none contains a compose file', async () => {
    const none = {
      readFromDirectory: async () => { throw new Error('no compose file'); },
    } as unknown as ComposeFileReader;

    ws.workspaceFolders = [
      { uri: { fsPath: '/work/a' } },
      { uri: { fsPath: '/work/b' } },
    ];
    await expect(resolveComposeCwd(none)).resolves.toBe('/work/a');
  });
});
