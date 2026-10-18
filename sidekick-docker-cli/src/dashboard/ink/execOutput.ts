/** Lines kept in the embedded exec pane's scrollback. */
export const MAX_EXEC_LINES = 5000;

/**
 * Append a chunk of terminal output to the line buffer: the first fragment
 * continues the last (unterminated) line, the rest start new lines. Returns a
 * new array capped at `max` lines.
 */
export function appendExecOutput(lines: readonly string[], data: string, max = MAX_EXEC_LINES): string[] {
  const parts = data.split('\n');
  const out = lines.length > 0 ? lines.slice() : [''];
  out[out.length - 1] += parts[0];
  for (let i = 1; i < parts.length; i++) out.push(parts[i]);
  return out.length > max ? out.slice(-max) : out;
}

/**
 * Coalesces PTY output into one dispatch per `intervalMs`. A `cat` of a large
 * file arrives as thousands of chunks; dispatching each one copied the whole
 * scrollback and re-rendered the dashboard per chunk.
 */
export class ExecOutputBuffer {
  private pending = '';
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly flushTo: (data: string) => void, private readonly intervalMs = 50) {}

  push(data: string): void {
    this.pending += data;
    if (this.timer) return;
    this.timer = setTimeout(() => this.flush(), this.intervalMs);
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.pending) return;
    const data = this.pending;
    this.pending = '';
    this.flushTo(data);
  }

  /** Drop anything pending without delivering it. */
  clear(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pending = '';
  }
}
