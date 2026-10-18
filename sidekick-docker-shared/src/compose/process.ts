import { spawn } from 'child_process';
import { StringDecoder } from 'node:string_decoder';

export interface ComposeExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface RunProcessOptions {
  cwd?: string;
  /** Merged over the inherited environment. Undefined inherits it unchanged. */
  env?: Record<string, string>;
  /** Kill the process after this long. Undefined or 0 means no deadline. */
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Grace between SIGTERM and SIGKILL once the deadline passes. */
  killGraceMs?: number;
}

/** Exit code reported for a process killed by its deadline (mirrors coreutils `timeout`). */
export const TIMEOUT_EXIT_CODE = 124;

/**
 * Run a command to completion and collect its output.
 *
 * Output is decoded with a StringDecoder per stream, so a multi-byte character
 * split across two chunks survives. A process that outlives `timeoutMs` is sent
 * SIGTERM, then SIGKILL after `killGraceMs`; the promise *resolves* with
 * {@link TIMEOUT_EXIT_CODE} and a "timed out" line appended to stderr, so callers
 * that already turn non-zero exits into a readable reason need no extra path.
 * Spawn failures (e.g. `docker` not installed) reject.
 */
export function runProcess(cmd: string, args: string[], opts: RunProcessOptions = {}): Promise<ComposeExecResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      cwd: opts.cwd,
      env: opts.env ? { ...process.env, ...opts.env } : undefined,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const outDecoder = new StringDecoder('utf8');
    const errDecoder = new StringDecoder('utf8');
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let aborted = false;
    let deadline: NodeJS.Timeout | undefined;
    let killTimer: NodeJS.Timeout | undefined;

    const terminate = () => {
      proc.kill('SIGTERM');
      killTimer = setTimeout(() => proc.kill('SIGKILL'), opts.killGraceMs ?? 2000);
      killTimer.unref?.();
    };
    const onAbort = () => { aborted = true; terminate(); };

    if (opts.timeoutMs && opts.timeoutMs > 0) {
      deadline = setTimeout(() => { timedOut = true; terminate(); }, opts.timeoutMs);
      deadline.unref?.();
    }
    if (opts.signal) {
      if (opts.signal.aborted) onAbort();
      else opts.signal.addEventListener('abort', onAbort, { once: true });
    }

    const cleanup = () => {
      clearTimeout(deadline);
      clearTimeout(killTimer);
      opts.signal?.removeEventListener('abort', onAbort);
    };

    proc.stdout.on('data', (data: Buffer) => { stdout += outDecoder.write(data); });
    proc.stderr.on('data', (data: Buffer) => { stderr += errDecoder.write(data); });

    proc.on('error', (err) => { cleanup(); reject(err); });
    proc.on('close', (code) => {
      cleanup();
      stdout += outDecoder.end();
      stderr += errDecoder.end();
      if (timedOut) {
        const secs = Math.round((opts.timeoutMs ?? 0) / 1000);
        const what = [cmd, args[0]].filter(Boolean).join(' ');
        stderr += `${stderr && !stderr.endsWith('\n') ? '\n' : ''}${what} timed out after ${secs}s`;
        resolve({ exitCode: TIMEOUT_EXIT_CODE, stdout, stderr });
        return;
      }
      if (aborted) {
        stderr += `${stderr && !stderr.endsWith('\n') ? '\n' : ''}cancelled`;
      }
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
  });
}
