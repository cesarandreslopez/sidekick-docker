/**
 * Manages a PTY-based `docker exec -it` session inside the TUI.
 * Uses node-pty (optional dependency) for interactive terminal emulation.
 * Falls back gracefully if node-pty is unavailable.
 */

interface IPty {
  onData: (callback: (data: string) => void) => { dispose: () => void };
  onExit: (callback: (e: { exitCode: number; signal?: number }) => void) => { dispose: () => void };
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  kill: (signal?: string) => void;
  pid: number;
}

interface NodePtyModule {
  spawn: (
    file: string,
    args: string[],
    options: { name?: string; cols?: number; rows?: number; env?: Record<string, string> },
  ) => IPty;
}

export interface ExecManagerOptions {
  containerId: string;
  containerName: string;
  cols: number;
  rows: number;
  onData: (data: string) => void;
  onExit: () => void;
  /**
   * Endpoint overrides for the spawned `docker` process (see `dockerCliEnv`).
   * A subprocess cannot see the endpoint dockerode was configured with, so
   * without this `--socket` silently exec'd into a container on a different
   * daemon than the one on screen.
   */
  env?: Record<string, string>;
}

export class ExecManager {
  private pty: IPty | null = null;
  private disposed = false;
  private disposables: Array<{ dispose: () => void }> = [];

  /**
   * Start a docker exec PTY session.
   * Returns true if started successfully, false if node-pty is unavailable.
   */
  async start(opts: ExecManagerOptions): Promise<boolean> {
    let nodePty: NodePtyModule;
    try {
      nodePty = await import('node-pty') as unknown as NodePtyModule;
    } catch {
      return false;
    }

    if (this.disposed) return false;
    this.pty = nodePty.spawn('docker', ['exec', '-it', opts.containerId, '/bin/sh'], {
      name: 'xterm-256color',
      cols: opts.cols,
      rows: Math.max(1, opts.rows - 2), // Reserve space for header
      env: { ...process.env, ...opts.env } as Record<string, string>,
    });

    this.disposables.push(
      this.pty.onData((data) => opts.onData(data)),
    );
    this.disposables.push(
      this.pty.onExit(() => opts.onExit()),
    );

    return true;
  }

  /** Forward raw bytes from stdin to the PTY. */
  write(data: string): void {
    this.pty?.write(data);
  }

  /** Update PTY dimensions on terminal resize. */
  resize(cols: number, rows: number): void {
    this.pty?.resize(cols, Math.max(1, rows - 2));
  }

  /** Kill the PTY process and clean up. */
  dispose(): void {
    this.disposed = true;
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
    if (this.pty) {
      try {
        this.pty.kill();
      } catch {
        // Already exited
      }
      this.pty = null;
    }
  }
}
