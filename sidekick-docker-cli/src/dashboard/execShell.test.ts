import { describe, expect, it } from 'vitest';
import { describeExecExit, resolveExecShell } from './execShell';

describe('resolveExecShell', () => {
  it('prefers the flag, then the environment, then /bin/sh', () => {
    expect(resolveExecShell('/bin/bash', { SIDEKICK_DOCKER_SHELL: '/bin/zsh' })).toBe('/bin/bash');
    expect(resolveExecShell(undefined, { SIDEKICK_DOCKER_SHELL: '/bin/zsh' })).toBe('/bin/zsh');
    expect(resolveExecShell('  ', {})).toBe('/bin/sh');
  });
});

describe('describeExecExit', () => {
  const base = { shell: '/bin/sh', containerName: 'api' };

  it('explains a missing shell', () => {
    const noSh = 'OCI runtime exec failed: exec failed: unable to start container process: exec: "/bin/sh": stat /bin/sh: no such file or directory: unknown';
    expect(describeExecExit({ ...base, exitCode: 126, outputTail: noSh })).toMatch(/No \/bin\/sh in api — the image may have no shell/);
    expect(describeExecExit({ ...base, shell: '/bin/bash', exitCode: 127, outputTail: 'exec: "/bin/bash": executable file not found in $PATH' })).toBe('No /bin/bash in api — try --shell /bin/sh.');
    const oci = 'OCI runtime exec failed: exec failed: unable to start container process: exec: "/bin/sh": stat /bin/sh: no such file or directory: unknown';
    expect(describeExecExit({ ...base, exitCode: 1, outputTail: oci })).toMatch(/--shell/);
  });

  it('stays quiet for an ordinary exit', () => {
    expect(describeExecExit({ ...base, exitCode: 0, outputTail: 'no such file or directory' })).toBeNull();
    expect(describeExecExit({ ...base, exitCode: 1, outputTail: '$ false\n$ exit' })).toBeNull();
    // Ctrl+D after a failed command: the shell exits 127 with its own message.
    expect(describeExecExit({ ...base, exitCode: 127, outputTail: '/ # foo\n/bin/sh: foo: not found\n/ # ' })).toBeNull();
    expect(describeExecExit({ ...base, exitCode: 1, outputTail: 'cat: x: No such file or directory' })).toBeNull();
  });
});
