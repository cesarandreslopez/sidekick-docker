import { EventEmitter } from 'node:events';
import { beforeEach, expect, it, vi } from 'vitest';
import { execFallback } from './execFallback';
const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn }));
let child: EventEmitter & { stderr?: EventEmitter };
beforeEach(() => { child = new EventEmitter(); spawn.mockReset().mockReturnValue(child); });
it('hands the terminal and configured Docker endpoint to the shell until it exits', async () => {
  const abort = new AbortController();
  const pending = execFallback('container-a', { DOCKER_HOST: 'ssh://test' }, abort.signal);
  // stderr is piped (and echoed) so a missing shell can be explained.
  expect(spawn).toHaveBeenCalledWith('docker', ['exec', '-it', 'container-a', '/bin/sh'], expect.objectContaining({ stdio: ['inherit', 'inherit', 'pipe'], signal: abort.signal, env: expect.objectContaining({ DOCKER_HOST: 'ssh://test' }) }));
  child.emit('exit', 0, null); child.emit('close', 0, null);
  await expect(pending).resolves.toBeUndefined();
});
it('reports a missing docker executable', async () => {
  const missing = execFallback('a');
  child.emit('error', new Error('spawn docker ENOENT'));
  await expect(missing).rejects.toThrow('ENOENT');
});
it('treats a non-zero shell exit as an ordinary end of the session', async () => {
  // A shell exits with its last command's status; that is not a dashboard error.
  const failed = execFallback('a'); child.emit('exit', 1, null); child.emit('close', 1, null);
  await expect(failed).resolves.toBeUndefined();
});
it('explains a missing shell from docker\'s own stderr, and still shows it', async () => {
  child.stderr = new EventEmitter();
  const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  try {
    const pending = execFallback('a', {}, undefined, '/bin/sh', 'web');
    child.stderr.emit('data', Buffer.from('OCI runtime exec failed: exec failed: unable to start container process: exec: "/bin/sh": stat /bin/sh: no such file or directory: unknown\n'));
    child.emit('exit', 126, null);
    child.emit('close', 126, null);
    await expect(pending).rejects.toThrow('No /bin/sh in web');
    expect(write).toHaveBeenCalled();
  } finally {
    write.mockRestore();
  }
});
it('reports docker\'s own error when exec itself fails', async () => {
  child.stderr = new EventEmitter();
  const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  try {
    const pending = execFallback('a');
    child.stderr.emit('data', 'Error response from daemon: container a is not running\n');
    child.emit('exit', 1, null);
    child.emit('close', 1, null);
    await expect(pending).rejects.toThrow('Error response from daemon: container a is not running');
  } finally {
    write.mockRestore();
  }
});
it('waits for stderr to drain: a message arriving after exit still explains it', async () => {
  child.stderr = new EventEmitter();
  const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  try {
    const pending = execFallback('a', {}, undefined, '/bin/sh', 'web');
    child.emit('exit', 126, null);
    child.stderr.emit('data', 'OCI runtime exec failed: exec failed: unable to start container process: exec: "/bin/sh": stat /bin/sh: no such file or directory: unknown\n');
    child.emit('close', 126, null);
    await expect(pending).rejects.toThrow('No /bin/sh in web');
  } finally {
    write.mockRestore();
  }
});
it('lets Ctrl+C return from the shell without treating it as a dashboard error', async () => {
  const pending = execFallback('a'); child.emit('exit', null, 'SIGINT'); child.emit('close', null, 'SIGINT');
  await expect(pending).resolves.toBeUndefined();
});

function probeChild(): EventEmitter & { stdout: EventEmitter; stderr: EventEmitter } {
  return Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter() });
}
it('probes without a TTY when the session ends 126/127 with nothing on stderr (Engine 29 prints a missing shell on the TTY)', async () => {
  const probe = probeChild();
  spawn.mockReturnValueOnce(child).mockReturnValueOnce(probe);
  const pending = execFallback('a', {}, undefined, '/bin/bash', 'web');
  child.emit('exit', 127, null); child.emit('close', 127, null);
  await vi.waitFor(() => expect(spawn).toHaveBeenCalledTimes(2));
  expect(spawn).toHaveBeenLastCalledWith('docker', ['exec', 'a', '/bin/bash', '-c', 'exit 0'], expect.objectContaining({ stdio: ['ignore', 'pipe', 'pipe'] }));
  probe.stdout.emit('data', 'OCI runtime exec failed: exec failed: unable to start container process: exec: "/bin/bash": stat /bin/bash: no such file or directory\n');
  probe.emit('close', 127);
  await expect(pending).rejects.toThrow('No /bin/bash in web');
});
it('treats 127 as an ordinary exit when the probe finds the shell (last command was not found)', async () => {
  const probe = probeChild();
  spawn.mockReturnValueOnce(child).mockReturnValueOnce(probe);
  const pending = execFallback('a', {}, undefined, '/bin/sh', 'web');
  child.emit('exit', 127, null); child.emit('close', 127, null);
  await vi.waitFor(() => expect(spawn).toHaveBeenCalledTimes(2));
  probe.emit('close', 0);
  await expect(pending).resolves.toBeUndefined();
});
it('does not probe for other exit codes', async () => {
  const pending = execFallback('a'); child.emit('exit', 2, null); child.emit('close', 2, null);
  await expect(pending).resolves.toBeUndefined();
  expect(spawn).toHaveBeenCalledTimes(1);
});
