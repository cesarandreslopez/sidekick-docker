import { spawn } from 'node:child_process';
import { DEFAULT_EXEC_SHELL, describeExecExit } from './execShell';

/** How much of docker's stderr to keep for explaining an immediate exit. */
const STDERR_TAIL = 512;

/** The last line of docker's own stderr that reports an error ("Error response from daemon: …"). */
function lastErrorLine(stderr: string): string | null {
  const lines = stderr.split(/\r?\n/).map(l => l.trim()).filter(l => /error/i.test(l));
  return lines.at(-1) ?? null;
}

/**
 * Runs inside Ink's suspendTerminal callback, leaving its component tree mounted.
 *
 * A non-zero exit alone is not a failure: a shell exits with whatever its last
 * command returned, and that used to raise an error toast after an ordinary
 * session. What is worth reporting is docker itself failing (a missing shell,
 * a stopped container), which it says on its own stderr — with -t the
 * container's output all arrives on stdout. That pipe is echoed to the
 * terminal and its tail kept, so the toast can say what went wrong once the
 * dashboard repaints over it.
 */
export function execFallback(
  containerId: string,
  env: Record<string, string> = {},
  signal?: AbortSignal,
  shell = DEFAULT_EXEC_SHELL,
  containerName = containerId,
): Promise<void> {
  return new Promise((resolve, reject) => {
    // With -t the container's stderr arrives on stdout (the TTY); this pipe
    // carries only the docker CLI's own messages.
    const child = spawn('docker', ['exec', '-it', containerId, shell], {
      stdio: ['inherit', 'inherit', 'pipe'], env: { ...process.env, ...env }, signal,
    });
    let stderrTail = '';
    child.stderr?.on('data', (chunk: Buffer | string) => {
      process.stderr.write(chunk);
      stderrTail = (stderrTail + chunk.toString()).slice(-STDERR_TAIL);
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      const missing = describeExecExit({ exitCode: code, outputTail: stderrTail, shell, containerName });
      if (missing) { reject(new Error(missing)); return; }
      const dockerError = code !== 0 && code !== null ? lastErrorLine(stderrTail) : null;
      if (dockerError) reject(new Error(dockerError));
      else resolve();
    });
  });
}
