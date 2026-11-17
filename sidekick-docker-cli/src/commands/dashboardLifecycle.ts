/**
 * The dashboard's terminal lifecycle, kept out of `dashboard.ts` so it can be
 * tested: the stream Ink renders to, exit codes for signals, and the fatal
 * guard that restores the terminal before an error is printed.
 *
 * Ink 7 enters and leaves the alternate screen itself (`alternateScreen`
 * render option, also around `suspendTerminal`), so the user's scrollback and
 * shell output are left alone. What it does not do is stop clearing the
 * scrollback: once a frame fills the terminal, every full repaint is written
 * as `ESC[2J ESC[3J ESC[H`, and whether `ESC[3J` reaches the main buffer from
 * the alternate screen is up to the terminal. The stream handed to Ink drops it.
 */
import { constants } from 'node:os';

/** Signals after which the dashboard unmounts (leaving the alternate screen) and exits. */
export const DASHBOARD_EXIT_SIGNALS: readonly NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP'];

/**
 * The shell convention for a process ended by a signal: 128 + its number
 * (SIGINT 130, SIGTERM 143). The dashboard used to exit 0 on SIGTERM, which
 * told a supervisor or script it had finished normally.
 */
export function signalExitCode(signal: NodeJS.Signals): number {
  const signo = (constants.signals as Partial<Record<NodeJS.Signals, number>>)[signal];
  return signo === undefined ? 1 : 128 + signo;
}

const ERASE_SCROLLBACK = /\x1b\[3J/g;

/** A chunk Ink writes, minus scrollback erases. Non-strings pass through. */
export function stripScrollbackErase(chunk: unknown): unknown {
  return typeof chunk === 'string' ? chunk.replace(ERASE_SCROLLBACK, '') : chunk;
}

type WriteFn = (chunk: unknown, encoding?: unknown, callback?: unknown) => boolean;

/**
 * The stream to give Ink: `stream` itself, except that writes lose `ESC[3J`.
 * A proxy rather than a copy, so `columns`/`rows`, `isTTY` and resize
 * listeners stay live on the real stream. Only a TTY is wrapped; anything
 * else is returned unchanged.
 */
export function inkStdout(stream: NodeJS.WriteStream = process.stdout): NodeJS.WriteStream {
  if (!stream.isTTY) return stream;
  const write: WriteFn = (chunk, encoding, callback) =>
    (stream.write as unknown as WriteFn).call(stream, stripScrollbackErase(chunk), encoding, callback);
  return new Proxy(stream, {
    get(target, prop) {
      if (prop === 'write') return write;
      const value: unknown = Reflect.get(target, prop, target);
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
  });
}

/** Printed on stderr before the first ping, so a slow endpoint (ssh://) is not a blank wait. */
export function connectingLine(endpoint: string): string {
  return `Connecting to ${endpoint}…`;
}

/**
 * Printed when Exec falls back to `docker exec -it` in the main screen: the
 * dashboard disappears, and nothing said where it went or how to get back.
 */
export function execFallbackBanner(containerName: string): string {
  return `Shell in ${containerName} — type exit to return to sidekick-docker`;
}

export interface FatalHandlerOptions {
  /** Stop streams and unmount Ink, which leaves the alternate screen. */
  teardown: () => void;
  /** Where the error goes once the terminal is restored (stderr). */
  write: (text: string) => void;
  exit: (code: number) => void;
  /** Format the error (the CLI's errorMessage). */
  describe: (err: unknown) => string;
  /** Also print the stack (--verbose / DEBUG). */
  verbose?: boolean;
}

/**
 * Handler for `uncaughtException` / `unhandledRejection` while the dashboard
 * runs. Without it the error was printed into the alternate screen (or under
 * a still-raw terminal) and vanished with it. Teardown runs first, so the
 * message lands on the restored main screen; a failure in teardown must not
 * swallow the original error. Runs once.
 */
export function createFatalHandler(opts: FatalHandlerOptions): (err: unknown) => void {
  let handled = false;
  return (err: unknown) => {
    if (handled) return;
    handled = true;
    try { opts.teardown(); } catch { /* the original error matters more */ }
    try {
      opts.write(`Error: ${opts.describe(err)}\n`);
      if (opts.verbose && err instanceof Error && err.stack) opts.write(`${err.stack}\n`);
    } catch { /* the terminal is gone */ }
    opts.exit(1);
  };
}

/** Install `handler` for uncaught errors; returns the uninstaller. */
export function installFatalGuard(handler: (err: unknown) => void, proc: Pick<NodeJS.Process, 'on' | 'removeListener'> = process): () => void {
  proc.on('uncaughtException', handler);
  proc.on('unhandledRejection', handler);
  return () => {
    proc.removeListener('uncaughtException', handler);
    proc.removeListener('unhandledRejection', handler);
  };
}
