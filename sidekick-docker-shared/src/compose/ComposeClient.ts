import { spawn } from 'child_process';

export interface ComposeExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Wraps `docker compose` CLI commands.
 * Docker API has no native compose concept, so we shell out.
 */
export class ComposeClient {
  private async exec(args: string[], cwd?: string): Promise<ComposeExecResult> {
    return new Promise((resolve, reject) => {
      const proc = spawn('docker', ['compose', ...args], {
        cwd,
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
}
