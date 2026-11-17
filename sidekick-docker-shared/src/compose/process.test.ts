import { describe, expect, it } from 'vitest';
import { runProcess, TIMEOUT_EXIT_CODE } from './process';

// Real child processes: the node binary running these tests is the one thing
// guaranteed to exist on every CI runner.
const node = process.execPath;

describe('runProcess', () => {
  it('collects stdout, stderr and the exit code', async () => {
    const r = await runProcess(node, ['-e', 'process.stdout.write("out"); process.stderr.write("err"); process.exit(3)']);
    expect(r).toEqual({ exitCode: 3, stdout: 'out', stderr: 'err' });
  });

  it('keeps a multi-byte character that is split across two writes', async () => {
    const script = 'const b = Buffer.from("café"); process.stdout.write(b.subarray(0, 4)); setTimeout(() => process.stdout.write(b.subarray(4)), 20);';
    const r = await runProcess(node, ['-e', script]);
    expect(r.stdout).toBe('café');
  });

  it('merges extra env over the inherited environment', async () => {
    const r = await runProcess(node, ['-e', 'process.stdout.write(`${process.env.SDK_TEST}|${typeof process.env.PATH}`)'], { env: { SDK_TEST: 'yes' } });
    expect(r.stdout).toBe('yes|string');
  });

  it('kills a hung process at the deadline and resolves with a readable reason', async () => {
    const started = Date.now();
    const r = await runProcess(node, ['-e', 'setInterval(() => {}, 1000)'], { timeoutMs: 200, killGraceMs: 200 });
    expect(r.exitCode).toBe(TIMEOUT_EXIT_CODE);
    expect(r.stderr).toMatch(/timed out after 0s$/);
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('escalates to SIGKILL when SIGTERM is ignored', async () => {
    const r = await runProcess(node, ['-e', 'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000)'], { timeoutMs: 150, killGraceMs: 150 });
    expect(r.exitCode).toBe(TIMEOUT_EXIT_CODE);
  });

  it('stops the process when the signal aborts', async () => {
    const abort = new AbortController();
    const pending = runProcess(node, ['-e', 'setInterval(() => {}, 1000)'], { signal: abort.signal });
    setTimeout(() => abort.abort(), 100);
    const r = await pending;
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/cancelled$/);
    expect(r.cancelled).toBe(true);
  });

  it('streams output to onOutput as it arrives, and still collects it', async () => {
    const chunks: string[] = [];
    const r = await runProcess(node, ['-e', 'process.stdout.write("a"); process.stderr.write("b")'], {
      onOutput: (text, stream) => chunks.push(`${stream}:${text}`),
    });
    expect(r.stdout).toBe('a');
    expect(r.stderr).toBe('b');
    expect(chunks.sort()).toEqual(['stderr:b', 'stdout:a']);
    expect(r.cancelled).toBeUndefined();
  });

  it('keeps running when the output sink throws', async () => {
    const r = await runProcess(node, ['-e', 'process.stdout.write("x")'], { onOutput: () => { throw new Error('sink'); } });
    expect(r).toMatchObject({ exitCode: 0, stdout: 'x' });
  });

  it('rejects when the command cannot be spawned', async () => {
    await expect(runProcess('sidekick-definitely-not-a-binary', [])).rejects.toMatchObject({
      code: 'ENOENT',
      message: 'The sidekick-definitely-not-a-binary CLI was not found on PATH. Install it, or add it to PATH.',
    });
  });
});
