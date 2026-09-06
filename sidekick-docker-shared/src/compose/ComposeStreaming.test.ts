import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter, getEventListeners } from 'node:events';
import { PassThrough } from 'node:stream';
import { ComposeClient } from './ComposeClient';
const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('child_process', () => ({ spawn }));
function processFixture() {
  const proc = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() });
  spawn.mockReturnValue(proc);
  return proc;
}
afterEach(() => vi.resetAllMocks());
describe('Compose processes', () => {
  it('passes every override before the command and preserves daemon overrides', async () => {
    const proc = processFixture();
    const pending = new ComposeClient({ DOCKER_HOST: 'ssh://test' }).up('app', { cwd: '/app', configFiles: ['/app/base.yml', '/app/override.yml'] });
    expect(spawn).toHaveBeenCalledWith('docker', ['compose', '-f', '/app/base.yml', '-f', '/app/override.yml', '-p', 'app', 'up', '-d'], expect.objectContaining({ cwd: '/app', env: expect.objectContaining({ DOCKER_HOST: 'ssh://test' }) }));
    proc.emit('close', 0); await pending;
  });
  it('preserves split UTF-8 and flushes a final unterminated line', async () => {
    const proc = processFixture();
    const stream = new ComposeClient().streamLogs('app')[Symbol.asyncIterator]();
    const first = stream.next();
    const bytes = Buffer.from('web | 2026-01-01T00:00:00Z café');
    for (const byte of bytes) proc.stdout.write(Buffer.from([byte]));
    proc.emit('close', 0);
    expect((await first).value?.message).toBe('web | café');
    expect((await stream.next()).done).toBe(true);
  });
  it('surfaces nonzero exit diagnostics instead of treating a failed stream as empty', async () => {
    const proc = processFixture();
    const stream = new ComposeClient().streamLogs('app')[Symbol.asyncIterator]();
    const first = stream.next();
    proc.stderr.write('Error: daemon unavailable\n'); proc.emit('close', 17);
    await first;
    await expect(stream.next()).rejects.toThrow('daemon unavailable');
  });
  it('kills an idle process on abort and removes its listener', async () => {
    const proc = processFixture(); const abort = new AbortController();
    const stream = new ComposeClient().streamLogs('app', undefined, 100, abort.signal)[Symbol.asyncIterator]();
    const next = stream.next(); abort.abort();
    expect((await next).done).toBe(true);
    expect(proc.kill).toHaveBeenCalled();
    expect(getEventListeners(abort.signal, 'abort')).toHaveLength(0);
  });
});
