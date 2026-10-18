import { readFile, stat as fsStat } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import type { ComposeFileConfig, ComposeFileReader } from './ComposeFileReader';

/** Anything that can produce the compose config for a directory. */
export interface ComposeConfigSource {
  read(cwd: string, opts?: { signal?: AbortSignal; force?: boolean }): Promise<ComposeFileConfig | null>;
}

type StatFn = (path: string) => Promise<{ mtimeMs: number; size: number } | null>;
type ReadTextFn = (path: string) => Promise<string | null>;

const defaultReadText: ReadTextFn = async (path) => {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
};

/** COMPOSE_FILE as set in a project's `.env` (compose reads it from there too). */
function composeFileFromDotEnv(text: string | null): string | undefined {
  const m = text?.match(/^\s*COMPOSE_FILE\s*=\s*(.*?)\s*$/m);
  return m?.[1]?.replace(/^(['"])(.*)\1$/, '$2') || undefined;
}

/** File names `docker compose` looks for, in its own precedence order. */
const COMPOSE_FILES = ['compose.yaml', 'compose.yml', 'docker-compose.yaml', 'docker-compose.yml'];
const OVERRIDE_FILES = ['compose.override.yaml', 'compose.override.yml', 'docker-compose.override.yaml', 'docker-compose.override.yml'];
const ENV_KEYS = ['COMPOSE_FILE', 'COMPOSE_PROJECT_NAME', 'COMPOSE_PROFILES', 'COMPOSE_PATH_SEPARATOR'];

const defaultStat: StatFn = async (path) => {
  try {
    const s = await fsStat(path);
    return s.isFile() ? { mtimeMs: s.mtimeMs, size: s.size } : null;
  } catch {
    return null;
  }
};

/**
 * A cheap fingerprint of the inputs `docker compose config` would read for `cwd`,
 * or null when compose would find no project there at all.
 *
 * Mirrors compose's lookup: `COMPOSE_FILE` when set, otherwise the first
 * directory walking up from `cwd` that holds a compose file — whose override
 * and `.env` files then count too. Files pulled in via `include:`/`extends:` are
 * not seen here; the cache's max age covers those.
 */
export async function composeFileSignature(
  cwd: string,
  deps: { stat?: StatFn; env?: Record<string, string | undefined>; readText?: ReadTextFn } = {},
): Promise<string | null> {
  const stat = deps.stat ?? defaultStat;
  const processEnv = deps.env ?? process.env;
  // The process environment wins over .env, as in compose itself.
  const dotEnvComposeFile = processEnv.COMPOSE_FILE ? undefined
    : composeFileFromDotEnv(await (deps.readText ?? defaultReadText)(join(cwd, '.env')));
  const env = dotEnvComposeFile ? { ...processEnv, COMPOSE_FILE: dotEnvComposeFile } : processEnv;
  const parts = ENV_KEYS.map(k => `${k}=${env[k] ?? ''}`);
  const statPart = async (path: string) => {
    const s = await stat(path);
    return s ? `${path}:${s.mtimeMs}:${s.size}` : null;
  };

  if (env.COMPOSE_FILE) {
    const sep = env.COMPOSE_PATH_SEPARATOR || (process.platform === 'win32' ? ';' : ':');
    for (const file of env.COMPOSE_FILE.split(sep).filter(Boolean)) {
      parts.push((await statPart(resolve(cwd, file))) ?? `${file}:missing`);
    }
    parts.push((await statPart(join(cwd, '.env'))) ?? '.env:none');
    return parts.join('|');
  }

  let dir = resolve(cwd);
  for (;;) {
    const found: string[] = [];
    for (const name of COMPOSE_FILES) {
      const s = await statPart(join(dir, name));
      if (s) found.push(s);
    }
    if (found.length > 0) {
      for (const name of [...OVERRIDE_FILES, '.env']) {
        const s = await statPart(join(dir, name));
        if (s) found.push(s);
      }
      return [...parts, ...found].join('|');
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export interface CachedComposeFileReaderOptions {
  /** Re-read even when no file changed, to pick up `include:`/`extends:` edits. Default 5min. */
  maxAgeMs?: number;
  stat?: StatFn;
  env?: Record<string, string | undefined>;
  readText?: ReadTextFn;
  now?: () => number;
}

/**
 * Wraps {@link ComposeFileReader} so `docker compose config` is spawned only when
 * its inputs could have changed.
 *
 * Both dashboards refresh on every interval and after every relevant Docker
 * event; spawning compose each time cost a subprocess per refresh even in a
 * directory with no compose file at all. Now: no compose file → null without
 * spawning; unchanged files → cached result; concurrent reads share one spawn;
 * timeouts and other transient failures are not cached.
 */
export class CachedComposeFileReader implements ComposeConfigSource {
  private readonly maxAgeMs: number;
  private readonly now: () => number;
  private cached: { cwd: string; signature: string; at: number; config: ComposeFileConfig | null } | null = null;
  private inflight: { key: string; promise: Promise<ComposeFileConfig | null>; signal?: AbortSignal } | null = null;

  constructor(private readonly reader: ComposeFileReader, private readonly options: CachedComposeFileReaderOptions = {}) {
    this.maxAgeMs = options.maxAgeMs ?? 5 * 60_000;
    this.now = options.now ?? Date.now;
  }

  async read(cwd: string, opts: { signal?: AbortSignal; force?: boolean } = {}): Promise<ComposeFileConfig | null> {
    const signature = await composeFileSignature(cwd, { stat: this.options.stat, env: this.options.env, readText: this.options.readText });
    if (signature === null) {
      this.cached = null;
      return null;
    }

    const c = this.cached;
    if (!opts.force && c && c.cwd === cwd && c.signature === signature && this.now() - c.at < this.maxAgeMs) {
      return c.config;
    }

    const key = `${cwd}\0${signature}`;
    // Join a read in flight, unless it belongs to a pass that was aborted
    // (timed out): that one will resolve to a transient failure.
    if (this.inflight?.key === key && !this.inflight.signal?.aborted) return this.inflight.promise;

    const promise = this.reader.read(cwd, { signal: opts.signal }).then((result) => {
      if (!result.transient) this.cached = { cwd, signature, at: this.now(), config: result.config };
      // A transient failure keeps serving the last good config for this directory.
      return result.transient && c?.cwd === cwd ? c.config : result.config;
    }).finally(() => {
      if (this.inflight?.promise === promise) this.inflight = null;
    });
    this.inflight = { key, promise, signal: opts.signal };
    return promise;
  }

  invalidate(): void {
    this.cached = null;
  }
}
