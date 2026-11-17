import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ComposeError } from 'sidekick-docker-shared';
import {
  warnComposeUntrusted,
  lineSink,
  composeCancelledText,
  runComposeAction,
  runComposeWithNotifications,
  isComposeCancelled,
  createComposeOutput,
} from './composeRunner';
import type { ComposeOutput } from './composeRunner';
import { __mock, window } from '../test/vscode';

function channel(): ComposeOutput {
  return window.createOutputChannel('Sidekick Docker') as unknown as ComposeOutput;
}
const lines = () => __mock.outputLines.map(l => `${l.level}: ${l.text}`);
const cancelledError = () => new ComposeError('up', { exitCode: 143, stdout: '', stderr: 'cancelled', cancelled: true });

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

describe('createComposeOutput', () => {
  beforeEach(() => __mock.reset());

  it('creates one "Sidekick Docker" log channel, on its first write', () => {
    const create = vi.spyOn(window, 'createOutputChannel');
    try {
      const output = createComposeOutput();
      expect(create).not.toHaveBeenCalled();
      output.info('a');
      output.error('b');
      output.show(true);
      expect(create).toHaveBeenCalledTimes(1);
      expect(create).toHaveBeenCalledWith('Sidekick Docker', { log: true });
      expect(lines()).toEqual(['info: a', 'error: b']);
      expect(__mock.shownChannels).toEqual(['Sidekick Docker']);
      output.dispose();
    } finally {
      create.mockRestore();
    }
  });
});

describe('lineSink', () => {
  it('turns chunks split anywhere into whole lines, dropping CRs and blank lines', () => {
    const out: string[] = [];
    const sink = lineSink(l => out.push(l));
    sink.push(' Container shop-db-1  Start');
    sink.push('ing\r\n\n Container shop-web');
    expect(out).toEqual([' Container shop-db-1  Starting']);
    sink.flush();
    expect(out).toEqual([' Container shop-db-1  Starting', ' Container shop-web']);
  });
});

describe('composeCancelledText', () => {
  it('words a cancel from the shared progress text, never as a failure', () => {
    expect(composeCancelledText('up', 'shop')).toBe('Cancelled bringing shop up');
    expect(composeCancelledText('down', 'shop')).toBe('Cancelled taking shop down');
    expect(composeCancelledText('restart', 'shop/web')).toBe('Cancelled restarting shop/web');
  });
});

describe('runComposeAction', () => {
  beforeEach(() => __mock.reset());

  it('runs up/down/restart under a cancellable progress notification, stop under a plain one', async () => {
    for (const action of ['up', 'down', 'restart', 'stop'] as const) {
      await runComposeAction(action, 'shop', undefined, async () => { /* ok */ });
    }
    expect(__mock.progressCalls.map(p => [p.title, p.cancellable])).toEqual([
      ['Bringing shop up…', true],
      ['Taking shop down…', true],
      ['Restarting shop…', true],
      ['Stopping shop…', false],
    ]);
  });

  it('streams the full output into the channel and logs the outcome', async () => {
    await runComposeAction('up', 'shop', channel(), async ({ onOutput }) => {
      onOutput?.(' Network shop_default  Created\n Container shop-db-1  St', 'stderr');
      onOutput?.('arted\n', 'stderr');
      onOutput?.('done', 'stdout');
    });
    expect(lines()).toEqual([
      'info: docker compose up: shop',
      'info:  Network shop_default  Created',
      'info:  Container shop-db-1  Started',
      'info: done',
      'info: shop is up',
    ]);
  });

  it('aborts the run\'s signal when the notification is cancelled, and logs it as cancelled', async () => {
    let signal: AbortSignal | undefined;
    const run = runComposeAction('up', 'shop', channel(), async (hooks) => {
      signal = hooks.signal;
      await new Promise<void>((_, reject) => hooks.signal?.addEventListener('abort', () => reject(cancelledError())));
    });
    await vi.waitFor(() => expect(signal).toBeDefined());
    __mock.cancelProgress();
    const err = await run.catch((e: unknown) => e);
    expect(signal?.aborted).toBe(true);
    expect(isComposeCancelled(err)).toBe(true);
    expect(lines().at(-1)).toBe('warn: Cancelled bringing shop up');
  });

  it('logs a failure as an error and rethrows it', async () => {
    await expect(runComposeAction('down', 'shop', channel(), async () => { throw new Error('no such project'); })).rejects.toThrow('no such project');
    expect(lines().at(-1)).toBe('error: Failed to take shop down: no such project');
  });
});

describe('runComposeWithNotifications', () => {
  beforeEach(() => __mock.reset());

  it('reports success as information', async () => {
    await runComposeWithNotifications('up', 'shop', channel(), async () => { /* ok */ });
    expect(__mock.infoMessages).toEqual(['shop is up']);
  });

  it('reports a cancel as information, not as a failure', async () => {
    await runComposeWithNotifications('up', 'shop', channel(), async () => { throw cancelledError(); });
    expect(__mock.infoMessages).toEqual(['Cancelled bringing shop up']);
    expect(__mock.errorMessages).toEqual([]);
  });

  it('offers Show Output on a failure', async () => {
    __mock.messageChoice = 'Show Output';
    await runComposeWithNotifications('restart', 'shop', channel(), async () => { throw new Error('exit status 1'); });
    expect(__mock.errorMessages).toEqual(['Failed to restart shop: exit status 1']);
    expect(__mock.messageItems.at(-1)).toEqual(['Show Output']);
    await vi.waitFor(() => expect(__mock.shownChannels).toEqual(['Sidekick Docker']));
  });
});
