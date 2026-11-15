/**
 * Rows the embedded exec session gets: the terminal less the overlay's
 * one-row header (the status bar is hidden during exec). The PTY and the
 * overlay both size from this, so output neither wraps nor leaves dead rows.
 */
export function execViewportRows(terminalRows: number): number {
  return Math.max(1, terminalRows - 1);
}

/** Shell used for Exec when nothing else is configured. */
export const DEFAULT_EXEC_SHELL = '/bin/sh';

/** `--shell`, else `SIDEKICK_DOCKER_SHELL`, else /bin/sh (mirrors VS Code's `exec.defaultShell`). */
export function resolveExecShell(flag: string | undefined, env: Record<string, string | undefined> = process.env): string {
  return flag?.trim() || env.SIDEKICK_DOCKER_SHELL?.trim() || DEFAULT_EXEC_SHELL;
}

/** What Docker itself prints when the exec'd binary does not exist (not what a shell prints). */
const MISSING_BINARY = /OCI runtime exec failed|executable file not found in \$PATH|exec: "[^"]*": stat [^:]+: no such file or directory/i;

/**
 * Explain an exec session that ended because the shell does not exist in the
 * container (distroless and scratch images have no /bin/sh). Previously the
 * overlay just closed with no word of why. Returns null for an ordinary exit
 * — a shell's exit code is whatever its last command returned.
 */
export function describeExecExit(e: { exitCode: number | null; outputTail: string; shell: string; containerName: string }): string | null {
  // Docker's own message, not the exit code: a shell left with Ctrl+D right
  // after "command not found" also exits 127.
  const missing = e.exitCode !== 0 && MISSING_BINARY.test(e.outputTail);
  if (!missing) return null;
  return e.shell === DEFAULT_EXEC_SHELL
    ? `No ${e.shell} in ${e.containerName} — the image may have no shell at all (distroless/scratch). Pick one with --shell or SIDEKICK_DOCKER_SHELL.`
    : `No ${e.shell} in ${e.containerName} — try --shell /bin/sh.`;
}
