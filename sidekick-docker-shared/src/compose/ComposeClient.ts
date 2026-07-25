import { spawn } from 'child_process';
import type { LogEntry } from '../types/container';

export interface ComposeExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** Raised when a `docker compose` invocation exits non-zero. */
export class ComposeError extends Error {
  readonly exitCode: number;
  readonly stderr: string;

  constructor(action: string, result: ComposeExecResult) {
    super(`${action} failed: ${composeFailureReason(result)}`);
    this.name = 'ComposeError';
    this.exitCode = result.exitCode;
    this.stderr = result.stderr;
  }
}

/**
 * Best one-line explanation of a failed compose run.
 *
 * `docker compose` writes progress to stderr even on success (" Container x
 * Started"), so the last line is usually noise. Prefer a line that actually
 * announces an error, and fall back to the exit code rather than echoing a
 * progress line as though it were the cause.
 */
export function composeFailureReason(result: ComposeExecResult): string {
  const lines = result.stderr
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  const errorLine = lines.find(l => /\berror\b|\bfailed\b|\bcannot\b|\bno such\b/i.test(l));
  if (errorLine) return errorLine;

  const last = lines[lines.length - 1];
  if (last) return last;

  return `exit code ${result.exitCode}`;
}

/** Throw when a compose run failed; pass through unchanged when it succeeded. */
export function throwIfComposeFailed(result: ComposeExecResult, action: string): ComposeExecResult {
  if (result.exitCode !== 0) throw new ComposeError(action, result);
  return result;
}

/**
 * Wraps `docker compose` CLI commands.
 * Docker API has no native compose concept, so we shell out.
 */
export class ComposeClient {
  /**
   * @param extraEnv Environment overrides for every spawned `docker compose`
   *   process (e.g. DOCKER_HOST so compose targets the same daemon as the API
   *   client — see `dockerCliEnv`). Merged over the inherited environment.
   */
  constructor(private readonly extraEnv?: Record<string, string>) {}

  private spawnEnv(): NodeJS.ProcessEnv | undefined {
    return this.extraEnv ? { ...process.env, ...this.extraEnv } : undefined;
  }

  private async exec(args: string[], cwd?: string): Promise<ComposeExecResult> {
    return new Promise((resolve, reject) => {
      const proc = spawn('docker', ['compose', ...args], {
        cwd,
        env: this.spawnEnv(),
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const stdout: string[] = [];
      const stderr: string[] = [];

      proc.stdout.on('data', (data: Buffer) => stdout.push(data.toString()));
      proc.stderr.on('data', (data: Buffer) => stderr.push(data.toString()));

      proc.on('error', reject);
      proc.on('close', (code) => {
        resolve({
          exitCode: code ?? 1,
          stdout: stdout.join(''),
          stderr: stderr.join(''),
        });
      });
    });
  }

  async up(project: string, cwd?: string): Promise<ComposeExecResult> {
    return this.exec(['-p', project, 'up', '-d'], cwd);
  }

  async down(project: string, cwd?: string): Promise<ComposeExecResult> {
    return this.exec(['-p', project, 'down'], cwd);
  }

  async restart(project: string, service?: string, cwd?: string): Promise<ComposeExecResult> {
    const args = ['-p', project, 'restart'];
    if (service) args.push(service);
    return this.exec(args, cwd);
  }

  async stop(project: string, service?: string, cwd?: string): Promise<ComposeExecResult> {
    const args = ['-p', project, 'stop'];
    if (service) args.push(service);
    return this.exec(args, cwd);
  }

  async start(project: string, service?: string, cwd?: string): Promise<ComposeExecResult> {
    const args = ['-p', project, 'start'];
    if (service) args.push(service);
    return this.exec(args, cwd);
  }

  async logs(project: string, service?: string, tail = 100): Promise<ComposeExecResult> {
    const args = ['-p', project, 'logs', '--tail', String(tail)];
    if (service) args.push(service);
    return this.exec(args);
  }

  async ps(project: string): Promise<ComposeExecResult> {
    return this.exec(['-p', project, 'ps', '--format', 'json']);
  }

  async *streamLogs(project: string, service?: string, tail = 100, signal?: AbortSignal): AsyncIterable<LogEntry> {
    const args = ['-p', project, 'logs', '--follow', '--tail', String(tail), '--timestamps'];
    if (service) args.push(service);

    const proc = spawn('docker', ['compose', ...args], {
      env: this.spawnEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const parseLine = (line: string, stream: 'stdout' | 'stderr'): LogEntry | null => {
      if (!line.trim()) return null;
      // docker compose logs format: "service-name  | 2024-01-01T00:00:00.000Z message"
      // or with timestamps: "service-name  | 2024-01-01T00:00:00.000000000Z message"
      const pipeIdx = line.indexOf('|');
      let message = line;
      let timestamp: Date | null = null;

      if (pipeIdx > 0) {
        const after = line.substring(pipeIdx + 1).trimStart();
        // Try to parse ISO timestamp at the start
        const tsMatch = after.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[\d.]*Z?)\s*(.*)/);
        if (tsMatch) {
          const parsed = new Date(tsMatch[1]);
          if (!isNaN(parsed.getTime())) {
            timestamp = parsed;
            message = `${line.substring(0, pipeIdx).trim()} | ${tsMatch[2]}`;
          } else {
            message = `${line.substring(0, pipeIdx).trim()} | ${after}`;
          }
        } else {
          message = `${line.substring(0, pipeIdx).trim()} | ${after}`;
        }
      }

      return { timestamp, stream, message };
    };

    let stdoutBuffer = '';
    let stderrBuffer = '';
    let done = false;

    const MAX_QUEUE = 1000;
    const entries: LogEntry[] = [];
    let resolve: (() => void) | null = null;

    const push = (entry: LogEntry) => {
      entries.push(entry);
      if (entries.length > MAX_QUEUE) entries.shift();
      resolve?.();
    };

    const kill = () => {
      done = true;
      resolve?.();
      proc.kill();
    };

    if (signal) {
      signal.addEventListener('abort', kill, { once: true });
    }

    proc.stdout.on('data', (data: Buffer) => {
      stdoutBuffer += data.toString();
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop()!;
      for (const line of lines) {
        const entry = parseLine(line, 'stdout');
        if (entry) push(entry);
      }
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderrBuffer += data.toString();
      const lines = stderrBuffer.split('\n');
      stderrBuffer = lines.pop()!;
      for (const line of lines) {
        const entry = parseLine(line, 'stderr');
        if (entry) push(entry);
      }
    });

    proc.on('close', () => {
      done = true;
      resolve?.();
    });

    proc.on('error', () => {
      done = true;
      resolve?.();
    });

    try {
      while (!done) {
        if (entries.length === 0) {
          await new Promise<void>(r => { resolve = r; });
          resolve = null;
        }
        while (entries.length > 0) {
          yield entries.shift()!;
        }
      }
    } finally {
      proc.stdout.removeAllListeners();
      proc.stderr.removeAllListeners();
      proc.removeAllListeners();
      proc.kill();
    }
  }
}
