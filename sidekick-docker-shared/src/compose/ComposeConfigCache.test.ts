import { describe, expect, it, vi } from 'vitest';
import { join, resolve } from 'path';
import { CachedComposeFileReader, composeFileSignature } from './ComposeConfigCache';
import type { ComposeFileReader, ComposeReadResult } from './ComposeFileReader';

const ROOT = resolve('/work/app');
const CONFIG = { projectName: 'app', services: [] };

/** An in-memory filesystem: path → mtime. */
function fakeFs(files: Record<string, number>) {
  return {
    files,
    stat: vi.fn((path: string) => Promise.resolve(path in files ? { mtimeMs: files[path], size: 1 } : null)),
  };
}

function fakeReader(results: ComposeReadResult[] = [{ config: CONFIG, transient: false }]) {
  let i = 0;
  const read = vi.fn(() => Promise.resolve(results[Math.min(i++, results.length - 1)]));
  return { read, reader: { read } as unknown as ComposeFileReader };
}

describe('composeFileSignature', () => {
  it('is null when no compose file exists in cwd or any parent', async () => {
    const fs = fakeFs({});
    expect(await composeFileSignature(ROOT, { stat: fs.stat, env: {}, readText: () => Promise.resolve(null) })).toBeNull();
  });

  it('finds a compose file in a parent directory and includes its override and .env', async () => {
    const parent = resolve('/work');
    const fs = fakeFs({ [join(parent, 'compose.yaml')]: 1, [join(parent, 'compose.override.yaml')]: 2, [join(parent, '.env')]: 3 });
    const sig = await composeFileSignature(ROOT, { stat: fs.stat, env: {} });
    expect(sig).toContain(join(parent, 'compose.yaml'));
    expect(sig).toContain(join(parent, 'compose.override.yaml'));
    expect(sig).toContain(join(parent, '.env'));
  });

  it('honours COMPOSE_FILE set in the project .env', async () => {
    const fs = fakeFs({ [join(ROOT, 'stack.yml')]: 1 });
    const readText = (p: string) => Promise.resolve(p === join(ROOT, '.env') ? 'FOO=1\nCOMPOSE_FILE="stack.yml"\n' : null);
    const sig = await composeFileSignature(ROOT, { stat: fs.stat, env: {}, readText });
    expect(sig).toContain(join(ROOT, 'stack.yml'));
  });

  it('honours COMPOSE_FILE instead of searching', async () => {
    const fs = fakeFs({});
    const sig = await composeFileSignature(ROOT, { stat: fs.stat, env: { COMPOSE_FILE: 'custom.yml' } });
    expect(sig).toContain('COMPOSE_FILE=custom.yml');
    expect(sig).toContain('custom.yml:missing');
  });

  it('changes when a file is modified', async () => {
    const fs = fakeFs({ [join(ROOT, 'compose.yaml')]: 1 });
    const before = await composeFileSignature(ROOT, { stat: fs.stat, env: {} });
    fs.files[join(ROOT, 'compose.yaml')] = 2;
    expect(await composeFileSignature(ROOT, { stat: fs.stat, env: {} })).not.toBe(before);
  });
});

describe('CachedComposeFileReader', () => {
  const setup = (files: Record<string, number> = { [join(ROOT, 'compose.yaml')]: 1 }, results?: ComposeReadResult[]) => {
    const fs = fakeFs(files);
    const r = fakeReader(results);
    let now = 0;
    const cache = new CachedComposeFileReader(r.reader, { stat: fs.stat, env: {}, readText: () => Promise.resolve(null), now: () => now, maxAgeMs: 1000 });
    return { fs, r, cache, tick: (ms: number) => { now += ms; } };
  };

  it('never spawns when there is no compose file', async () => {
    const { r, cache } = setup({});
    expect(await cache.read(ROOT)).toBeNull();
    expect(r.read).not.toHaveBeenCalled();
  });

  it('spawns once across repeated reads with unchanged files', async () => {
    const { r, cache } = setup();
    for (let i = 0; i < 5; i++) expect(await cache.read(ROOT)).toEqual(CONFIG);
    expect(r.read).toHaveBeenCalledTimes(1);
  });

  it('re-reads when a file changes, when the max age passes, or on force', async () => {
    const { fs, r, cache, tick } = setup();
    await cache.read(ROOT);
    fs.files[join(ROOT, 'compose.yaml')] = 2;
    await cache.read(ROOT);
    expect(r.read).toHaveBeenCalledTimes(2);
    tick(1001);
    await cache.read(ROOT);
    expect(r.read).toHaveBeenCalledTimes(3);
    await cache.read(ROOT, { force: true });
    expect(r.read).toHaveBeenCalledTimes(4);
  });

  it('shares one spawn between concurrent reads', async () => {
    const { r, cache } = setup();
    await Promise.all([cache.read(ROOT), cache.read(ROOT), cache.read(ROOT)]);
    expect(r.read).toHaveBeenCalledTimes(1);
  });

  it('does not cache a transient failure and keeps serving the last good config', async () => {
    const { fs, r, cache } = setup(undefined, [
      { config: CONFIG, transient: false },
      { config: null, transient: true },
      { config: { projectName: 'app2', services: [] }, transient: false },
    ]);
    await cache.read(ROOT);
    fs.files[join(ROOT, 'compose.yaml')] = 2;
    expect(await cache.read(ROOT)).toEqual(CONFIG);
    expect(await cache.read(ROOT)).toEqual({ projectName: 'app2', services: [] });
    expect(r.read).toHaveBeenCalledTimes(3);
  });

  it('does not join an in-flight read whose pass was aborted', async () => {
    const fs = fakeFs({ [join(ROOT, 'compose.yaml')]: 1 });
    let release!: (r: ComposeReadResult) => void;
    const read = vi.fn()
      .mockImplementationOnce(() => new Promise<ComposeReadResult>(r => { release = r; }))
      .mockResolvedValueOnce({ config: CONFIG, transient: false });
    const cache = new CachedComposeFileReader({ read } as unknown as ComposeFileReader, { stat: fs.stat, env: {}, readText: () => Promise.resolve(null) });
    const abort = new AbortController();
    const first = cache.read(ROOT, { signal: abort.signal });
    await Promise.resolve();
    abort.abort();
    const second = await cache.read(ROOT);
    expect(second).toEqual(CONFIG);
    expect(read).toHaveBeenCalledTimes(2);
    release({ config: null, transient: true });
    await first;
  });
});

