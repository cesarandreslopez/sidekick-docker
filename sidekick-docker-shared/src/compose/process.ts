import { spawn } from 'child_process';
import { existsSync } from 'node:fs';
import { StringDecoder } from 'node:string_decoder';

export interface ComposeExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  /** True when the run was stopped through its AbortSignal. */
  cancelled?: boolean;
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
  /** Called with each decoded chunk as it arrives. */
  onOutput?: (text: string, stream: 'stdout' | 'stderr') => void;
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
 * Spawn failures reject; a missing binary rejects with a readable message and
 * `code: 'ENOENT'`.
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

    const emit = (text: string, stream: 'stdout' | 'stderr') => {
      if (text && opts.onOutput) {
        try { opts.onOutput(text, stream); } catch { /* a sink must not break the run */ }
      }
    };
    proc.stdout.on('data', (data: Buffer) => { const t = outDecoder.write(data); stdout += t; emit(t, 'stdout'); });
    proc.stderr.on('data', (data: Buffer) => { const t = errDecoder.write(data); stderr += t; emit(t, 'stderr'); });

    proc.on('error', (err: NodeJS.ErrnoException) => {
      cleanup();
      // "spawn docker ENOENT" told nobody what to do. Keep `code` so callers
      // that branch on a missing binary still can. Spawn also reports ENOENT
      // for a missing working directory — don't blame the binary for that.
      if (err.code === 'ENOENT' && opts.cwd && !existsSync(opts.cwd)) {
        reject(Object.assign(
          new Error(`The working directory ${opts.cwd} does not exist.`, { cause: err }),
          { code: err.code },
        ));
        return;
      }
      if (err.code === 'ENOENT') {
        reject(Object.assign(
          new Error(`The ${cmd} CLI was not found on PATH. Install it, or add it to PATH.`, { cause: err }),
          { code: err.code },
        ));
        return;
      }
      reject(err);
    });
    proc.on('close', (code) => {
      cleanup();
      const outTail = outDecoder.end();
      const errTail = errDecoder.end();
      stdout += outTail;
      stderr += errTail;
      emit(outTail, 'stdout');
      emit(errTail, 'stderr');
      if (timedOut) {
        const secs = Math.round((opts.timeoutMs ?? 0) / 1000);
        const what = [cmd, args[0]].filter(Boolean).join(' ');
        stderr += `${stderr && !stderr.endsWith('\n') ? '\n' : ''}${what} timed out after ${secs}s`;
        resolve({ exitCode: TIMEOUT_EXIT_CODE, stdout, stderr });
        return;
      }
      if (aborted) {
        stderr += `${stderr && !stderr.endsWith('\n') ? '\n' : ''}cancelled`;
        resolve({ exitCode: code ?? 1, stdout, stderr, cancelled: true });
        return;
      }
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
  });
}
