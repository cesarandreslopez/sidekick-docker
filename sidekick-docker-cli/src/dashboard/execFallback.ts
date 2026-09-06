import { spawn } from 'node:child_process';

/** Runs inside Ink's suspendTerminal callback, leaving its component tree mounted. */
export function execFallback(containerId: string, env: Record<string, string> = {}, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['exec', '-it', containerId, '/bin/sh'], {
      stdio: 'inherit', env: { ...process.env, ...env }, signal,
    });
    child.once('error', reject);
    child.once('exit', (code, exitSignal) => {
      if (code === 0 || exitSignal === 'SIGINT' || code === 130) resolve();
      else reject(new Error(`Docker exec exited with ${exitSignal ?? `code ${code}`}.`));
    });
  });
}
