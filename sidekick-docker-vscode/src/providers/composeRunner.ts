import * as vscode from 'vscode';
import { actionText, actionFailedText, errorMessage } from 'sidekick-docker-shared';
import type { ComposeCommandOptions } from 'sidekick-docker-shared';

const MANAGE_TRUST = 'Manage Workspace Trust';
export const SHOW_OUTPUT = 'Show Output';

/**
 * Compose is refused in an untrusted workspace (it would run the workspace's
 * own compose file). Say so with the way out, instead of only naming it.
 */
export function warnComposeUntrusted(action: string, name: string): void {
  void vscode.window.showWarningMessage(
    `Compose is disabled in an untrusted workspace — trust the folder to ${action} ${name}.`,
    MANAGE_TRUST,
  ).then((choice) => {
    if (choice === MANAGE_TRUST) void vscode.commands.executeCommand('workbench.trust.manage');
  });
}

/** Compose actions that run under a progress notification. */
export type ComposeAction = 'up' | 'down' | 'restart' | 'stop';

/** What a compose call is given to be cancellable and to stream its output. */
export type ComposeRunHooks = Pick<ComposeCommandOptions, 'signal' | 'onOutput'>;

/** The part of the "Sidekick Docker" LogOutputChannel compose runs write to. */
export type ComposeOutput = Pick<vscode.LogOutputChannel, 'info' | 'warn' | 'error' | 'show'>;

/** Collects chunks into whole lines: compose output arrives split anywhere. */
export function lineSink(write: (line: string) => void): { push(text: string): void; flush(): void } {
  let pending = '';
  const emit = (line: string): void => {
    const clean = line.replace(/\r$/, '');
    if (clean.trim()) write(clean);
  };
  return {
    push(text) {
      const lines = (pending + text).split('\n');
      pending = lines.pop() ?? '';
      lines.forEach(emit);
    },
    flush() {
      emit(pending);
      pending = '';
    },
  };
}

/** True for an error from a run the user cancelled (ComposeError.cancelled). */
export function isComposeCancelled(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { cancelled?: unknown }).cancelled === true;
}

/** "Cancelled bringing shop up": the shared progress wording, so a cancel never reads as "Failed to…". */
export function composeCancelledText(action: ComposeAction, name: string): string {
  const progress = actionText(action, name).progress.replace(/…$/, '');
  return `Cancelled ${progress.charAt(0).toLowerCase()}${progress.slice(1)}`;
}

/**
 * Run a compose action under a progress notification — cancellable for
 * up/down/restart — with its full stdout/stderr streamed into the output
 * channel, and the outcome logged there too. The progress title used to be
 * all you saw: no output, and no way to stop a `compose up` pulling images.
 *
 * Rejects like the action does; a cancelled run rejects with an error for
 * which isComposeCancelled() is true.
 */
export async function runComposeAction<T>(
  action: ComposeAction,
  name: string,
  output: ComposeOutput | undefined,
  run: (hooks: ComposeRunHooks) => Promise<T>,
): Promise<T> {
  const { progress, success } = actionText(action, name);
  return await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: progress, cancellable: action !== 'stop' },
    async (_progress, token) => {
      const controller = new AbortController();
      const cancel = token.onCancellationRequested(() => controller.abort());
      const sinks = { stdout: lineSink(l => output?.info(l)), stderr: lineSink(l => output?.info(l)) };
      output?.info(`docker compose ${action}: ${name}`);
      try {
        const result = await run({ signal: controller.signal, onOutput: (text, stream) => sinks[stream].push(text) });
        sinks.stdout.flush();
        sinks.stderr.flush();
        output?.info(success);
        return result;
      } catch (err) {
        sinks.stdout.flush();
        sinks.stderr.flush();
        if (isComposeCancelled(err)) output?.warn(composeCancelledText(action, name));
        else output?.error(actionFailedText(action, name, errorMessage(err)));
        throw err;
      } finally {
        cancel.dispose();
      }
    },
  );
}

/**
 * Run a compose action from the tree and report it with native
 * notifications: success, "Cancelled …" as information (never "Failed to…"),
 * and failures with "Show Output".
 */
export async function runComposeWithNotifications(
  action: ComposeAction,
  name: string,
  output: ComposeOutput | undefined,
  run: (hooks: ComposeRunHooks) => Promise<unknown>,
): Promise<void> {
  try {
    await runComposeAction(action, name, output, run);
    void vscode.window.showInformationMessage(actionText(action, name).success);
  } catch (err: unknown) {
    if (isComposeCancelled(err)) void vscode.window.showInformationMessage(composeCancelledText(action, name));
    else showComposeError(actionFailedText(action, name, errorMessage(err)), output);
  }
}

/** A native error for a failed compose run, offering the full output (plus any extra buttons). */
export function showComposeError(message: string, output: ComposeOutput | undefined, extra: { label: string; run: () => void }[] = []): void {
  const items = [...(output ? [SHOW_OUTPUT] : []), ...extra.map(e => e.label)];
  void vscode.window.showErrorMessage(message, ...items).then((choice) => {
    if (choice === SHOW_OUTPUT) output?.show(true);
    else extra.find(e => e.label === choice)?.run();
  });
}
