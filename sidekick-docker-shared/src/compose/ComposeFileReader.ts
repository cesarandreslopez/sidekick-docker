import { ComposeConfigRawSchema } from './schemas';
import { runProcess, TIMEOUT_EXIT_CODE } from './process';
import type { ComposeExecResult, RunProcessOptions } from './process';

export interface ComposeFileServiceConfig {
  name: string;
  image?: string;
  hasBuild: boolean;
  ports: string[];
}

export interface ComposeFileConfig {
  projectName: string;
  services: ComposeFileServiceConfig[];
}

export interface ComposeFileReaderOptions {
  /** Deadline for `docker compose config`. Default 10s. */
  timeoutMs?: number;
  /** Process runner override, for tests. */
  run?: (cmd: string, args: string[], opts: RunProcessOptions) => Promise<ComposeExecResult>;
}

/** Result of one read: `transient` failures (timeout, spawn error) are worth retrying; the rest are not. */
export interface ComposeReadResult {
  config: ComposeFileConfig | null;
  transient: boolean;
}

/**
 * Reads compose file configuration from disk using `docker compose config`.
 * Avoids adding a YAML parser — lets Docker handle interpolation, extends, profiles, etc.
 * Returns null on any failure (no file, invalid YAML, docker compose not installed).
 */
export class ComposeFileReader {
  private readonly timeoutMs: number;
  private readonly run: NonNullable<ComposeFileReaderOptions['run']>;

  /**
   * @param extraEnv Environment overrides (see `dockerCliEnv`) so the config is
   *   resolved against the same daemon/context as everything else.
   */
  constructor(private readonly extraEnv?: Record<string, string>, options: ComposeFileReaderOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.run = options.run ?? runProcess;
  }

  async readFromDirectory(cwd: string, opts: { signal?: AbortSignal } = {}): Promise<ComposeFileConfig | null> {
    return (await this.read(cwd, opts)).config;
  }

  /** Like {@link readFromDirectory}, but says whether a null result is worth retrying. */
  async read(cwd: string, opts: { signal?: AbortSignal } = {}): Promise<ComposeReadResult> {
    let result: ComposeExecResult;
    try {
      result = await this.run('docker', ['compose', 'config', '--format', 'json'], {
        cwd, env: this.extraEnv, timeoutMs: this.timeoutMs, signal: opts.signal,
      });
    } catch (err) {
      // A missing `docker` binary will not fix itself between refreshes.
      return { config: null, transient: (err as NodeJS.ErrnoException).code !== 'ENOENT' };
    }
    if (result.exitCode === TIMEOUT_EXIT_CODE || opts.signal?.aborted) return { config: null, transient: true };
    if (result.exitCode !== 0) return { config: null, transient: false };
    return { config: this.parse(result.stdout), transient: false };
  }

  private parse(stdout: string): ComposeFileConfig | null {
    try {
      const raw: unknown = JSON.parse(stdout);
      const config = ComposeConfigRawSchema.parse(raw);
      const projectName = config.name;
      if (!projectName) return null;

      const services: ComposeFileServiceConfig[] = [];

      for (const [name, def] of Object.entries(config.services)) {
        const ports: string[] = [];
        if (def.ports) {
          for (const p of def.ports) {
            if (typeof p === 'string') {
              ports.push(p);
            } else {
              ports.push(`${p.published}:${p.target}/${p.protocol}`);
            }
          }
        }

        services.push({
          name,
          image: def.image || undefined,
          hasBuild: !!def.build,
          ports,
        });
      }

      return { projectName, services };
    } catch {
      return null;
    }
  }
}
