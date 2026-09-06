import { EventEmitter } from 'node:events';
import { beforeEach, expect, it, vi } from 'vitest';
import { execFallback } from './execFallback';
const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn }));
let child: EventEmitter;
beforeEach(() => { child = new EventEmitter(); spawn.mockReset().mockReturnValue(child); });
it('hands the terminal and configured Docker endpoint to the shell until it exits', async () => {
  const abort = new AbortController();
  const pending = execFallback('container-a', { DOCKER_HOST: 'ssh://test' }, abort.signal);
  expect(spawn).toHaveBeenCalledWith('docker', ['exec', '-it', 'container-a', '/bin/sh'], expect.objectContaining({ stdio: 'inherit', signal: abort.signal, env: expect.objectContaining({ DOCKER_HOST: 'ssh://test' }) }));
  child.emit('exit', 0, null);
  await expect(pending).resolves.toBeUndefined();
});
it('reports missing executables and nonzero exits', async () => {
  const missing = execFallback('a');
  child.emit('error', new Error('spawn docker ENOENT'));
  await expect(missing).rejects.toThrow('ENOENT');
  child = new EventEmitter(); spawn.mockReturnValue(child);
  const failed = execFallback('a'); child.emit('exit', 1, null);
  await expect(failed).rejects.toThrow('code 1');
});
it('lets Ctrl+C return from the shell without treating it as a dashboard error', async () => {
  const pending = execFallback('a'); child.emit('exit', null, 'SIGINT');
  await expect(pending).resolves.toBeUndefined();
});
