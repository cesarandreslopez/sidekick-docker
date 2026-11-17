import { describe, it, expect } from 'vitest';
import { errorMessage, errorCode, explainDockerUnreachable } from './errors';

function errnoError(code: string, message = code): NodeJS.ErrnoException {
  const err: NodeJS.ErrnoException = new Error(message);
  err.code = code;
  return err;
}

describe('errorMessage', () => {
  it('returns Error messages', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
  });

  it('stringifies non-Error values', () => {
    expect(errorMessage('plain')).toBe('plain');
  });

  it("drops docker-modem's (HTTP code N) wrapper, keeping the daemon's message", () => {
    expect(errorMessage(new Error('(HTTP code 409) unexpected - You cannot remove a running container abc. Stop the container before attempting removal or force remove '))).toBe(
      'You cannot remove a running container abc. Stop the container before attempting removal or force remove',
    );
    expect(errorMessage(new Error('(HTTP code 404) no such container - No such container: web '))).toBe('No such container: web');
  });

  it('falls back to the reason when the daemon sent no body', () => {
    expect(errorMessage(new Error('(HTTP code 304) container already started - '))).toBe('container already started');
    expect(errorMessage(new Error('(HTTP code 500) server error - [object Object] '))).toBe('server error');
  });

  it('leaves other messages untouched', () => {
    expect(errorMessage(new Error('connect ECONNREFUSED /var/run/docker.sock'))).toBe('connect ECONNREFUSED /var/run/docker.sock');
  });
});

describe('errorCode', () => {
  it('extracts errno codes', () => {
    expect(errorCode(errnoError('ENOENT'))).toBe('ENOENT');
  });

  it('returns undefined for plain errors and non-objects', () => {
    expect(errorCode(new Error('x'))).toBeUndefined();
    expect(errorCode('nope')).toBeUndefined();
    expect(errorCode(null)).toBeUndefined();
  });

  it('ignores non-string code properties', () => {
    expect(errorCode({ code: 42 })).toBeUndefined();
  });
});

describe('explainDockerUnreachable', () => {
  const ep = '/var/run/docker.sock';
  const HINT = '--socket or DOCKER_HOST';

  it('explains permission errors', () => {
    expect(explainDockerUnreachable(errnoError('EACCES'), ep, HINT)).toMatch(/Permission denied.*docker.*group/i);
    expect(explainDockerUnreachable(errnoError('EPERM'), ep, HINT)).toMatch(/Permission denied/);
  });

  it('explains a missing socket', () => {
    expect(explainDockerUnreachable(errnoError('ENOENT'), ep, HINT)).toMatch(/socket not found/i);
    expect(explainDockerUnreachable(errnoError('ENOENT'), ep, HINT)).toContain(ep);
  });

  it('advises the surface-specific way to point elsewhere', () => {
    expect(explainDockerUnreachable(errnoError('ENOENT'), ep, 'the sidekick-docker.socketPath setting'))
      .toMatch(/Point elsewhere with the sidekick-docker\.socketPath setting\.$/);
    expect(explainDockerUnreachable(errnoError('ENOENT'), ep, 'the sidekick-docker.socketPath setting')).not.toContain('--socket');
  });

  it('explains connection refused', () => {
    expect(explainDockerUnreachable(errnoError('ECONNREFUSED'), 'tcp://h:2375', HINT)).toMatch(/Connection refused at tcp:\/\/h:2375/);
  });

  it('explains unreachable hosts', () => {
    for (const code of ['ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH']) {
      expect(explainDockerUnreachable(errnoError(code), 'tcp://h:2375', HINT)).toMatch(/Cannot reach/);
    }
  });

  it('falls back to a generic message with the original error text', () => {
    const msg = explainDockerUnreachable(new Error('weird failure'), ep, HINT);
    expect(msg).toContain('weird failure');
    expect(msg).toContain(ep);
  });
});
