/** Shell used for Exec when nothing else is configured. */
export const DEFAULT_EXEC_SHELL = '/bin/sh';

/** `--shell`, else `SIDEKICK_DOCKER_SHELL`, else /bin/sh (mirrors VS Code's `exec.defaultShell`). */
export function resolveExecShell(flag: string | undefined, env: Record<string, string | undefined> = process.env): string {
  return flag?.trim() || env.SIDEKICK_DOCKER_SHELL?.trim() || DEFAULT_EXEC_SHELL;
}

const MISSING_BINARY = /executable file not found|no such file or directory|OCI runtime exec failed/i;

/**
 * Explain an exec session that ended because the shell does not exist in the
 * container (distroless and scratch images have no /bin/sh). Previously the
 * overlay just closed with no word of why. Returns null for an ordinary exit
 * — a shell's exit code is whatever its last command returned.
 */
export function describeExecExit(e: { exitCode: number | null; outputTail: string; shell: string; containerName: string }): string | null {
  const missing = e.exitCode === 126 || e.exitCode === 127 || (e.exitCode !== 0 && MISSING_BINARY.test(e.outputTail));
  if (!missing) return null;
  return `No ${e.shell} in ${e.containerName} (distroless image?) — try --shell /bin/bash or set SIDEKICK_DOCKER_SHELL`;
}
