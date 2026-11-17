import { beforeEach, describe, expect, it, vi } from 'vitest';
import { warnComposeUntrusted } from './composeRunner';
import { __mock } from '../test/vscode';

describe('warnComposeUntrusted', () => {
  beforeEach(() => __mock.reset());

  it('says compose is disabled and offers to manage workspace trust', async () => {
    __mock.messageChoice = 'Manage Workspace Trust';
    warnComposeUntrusted('up', 'shop');
    expect(__mock.warningMessages).toEqual(['Compose is disabled in an untrusted workspace — trust the folder to up shop.']);
    expect(__mock.messageItems).toEqual([['Manage Workspace Trust']]);
    await vi.waitFor(() => expect(__mock.executedCommands).toContainEqual(['workbench.trust.manage']));
  });
});
