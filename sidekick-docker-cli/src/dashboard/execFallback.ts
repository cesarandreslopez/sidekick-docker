import { spawn } from 'node:child_process';
import { DEFAULT_EXEC_SHELL, describeExecExit } from './execShell';

/** Runs inside Ink's suspendTerminal callback, leaving its component tree mounted. */
export function execFallback(
  containerId: string,
  env: Record<string, string> = {},
  signal?: AbortSignal,
  shell = DEFAULT_EXEC_SHELL,
  containerName = containerId,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['exec', '-it', containerId, shell], {
      stdio: 'inherit', env: { ...process.env, ...env }, signal,
    });
    child.once('error', reject);
    child.once('exit', (code, exitSignal) => {
      if (code === 0 || exitSignal === 'SIGINT' || code === 130) { resolve(); return; }
      const missing = describeExecExit({ exitCode: code, outputTail: '', shell, containerName });
      reject(new Error(missing ?? `Docker exec exited with ${exitSignal ?? `code ${code}`}.`));
    });
  });
}
