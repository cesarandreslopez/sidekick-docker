import { spawn } from 'node:child_process';
import { DEFAULT_EXEC_SHELL, describeExecExit } from './execShell';

/** How much of docker's stderr to keep for explaining an immediate exit. */
const STDERR_TAIL = 512;

/** The last line of docker's own stderr that reports an error ("Error response from daemon: …"). */
function lastErrorLine(stderr: string): string | null {
  const lines = stderr.split(/\r?\n/).map(l => l.trim()).filter(l => /error/i.test(l));
  return lines.at(-1) ?? null;
}

/** How long the missing-shell probe may take before the session counts as ordinary. */
const PROBE_TIMEOUT_MS = 10_000;

/**
 * Run the shell once more, without a TTY, to learn whether it exists. Docker
 * (Engine 29 at least) reports a missing executable — "OCI runtime exec
 * failed … no such file or directory", exit 127 — on the exec's *output*
 * stream, which in the interactive session went straight to the terminal.
 * Here both streams are captured.
 */
function probeShell(
  containerId: string, shell: string, env: Record<string, string>, signal?: AbortSignal,
): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve) => {
    const deadline = AbortSignal.timeout(PROBE_TIMEOUT_MS);
    const probe = spawn('docker', ['exec', containerId, shell, '-c', 'exit 0'], {
      stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env },
      signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
    });
    let output = '';
    const keep = (chunk: Buffer | string) => { output = (output + chunk.toString()).slice(-STDERR_TAIL); };
    probe.stdout?.on('data', keep);
    probe.stderr?.on('data', keep);
    probe.once('error', () => resolve({ code: null, output }));
    probe.once('close', (code: number | null) => resolve({ code, output }));
  });
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
 * dashboard repaints over it. Newer engines print a missing shell on the
 * session's own output instead, so a 126/127 exit is checked with a probe.
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
    // 'close', not 'exit': only 'close' guarantees the stderr pipe has been
    // drained, and the message that explains the exit may arrive after it.
    child.once('close', (code: number | null) => {
      const missing = describeExecExit({ exitCode: code, outputTail: stderrTail, shell, containerName });
      if (missing) { reject(new Error(missing)); return; }
      const dockerError = code !== 0 && code !== null ? lastErrorLine(stderrTail) : null;
      if (dockerError) { reject(new Error(dockerError)); return; }
      // 126/127 is either a shell whose last command was not found, or no
      // shell at all — and Docker said which on the TTY, out of our sight.
      // Ask again without one; only Docker's own message counts as missing.
      if (code === 126 || code === 127) {
        void probeShell(containerId, shell, env, signal).then(({ code: probeCode, output }) => {
          const missingShell = describeExecExit({ exitCode: probeCode, outputTail: output, shell, containerName });
          if (missingShell) reject(new Error(missingShell));
          else resolve();
        });
        return;
      }
      resolve();
    });
  });
}
