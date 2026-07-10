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

  it('explains permission errors', () => {
    expect(explainDockerUnreachable(errnoError('EACCES'), ep)).toMatch(/Permission denied.*docker.*group/i);
    expect(explainDockerUnreachable(errnoError('EPERM'), ep)).toMatch(/Permission denied/);
  });

  it('explains a missing socket', () => {
    expect(explainDockerUnreachable(errnoError('ENOENT'), ep)).toMatch(/socket not found/i);
    expect(explainDockerUnreachable(errnoError('ENOENT'), ep)).toContain(ep);
  });

  it('explains connection refused', () => {
    expect(explainDockerUnreachable(errnoError('ECONNREFUSED'), 'tcp://h:2375')).toMatch(/Connection refused at tcp:\/\/h:2375/);
  });

  it('explains unreachable hosts', () => {
    for (const code of ['ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH']) {
      expect(explainDockerUnreachable(errnoError(code), 'tcp://h:2375')).toMatch(/Cannot reach/);
    }
  });

  it('falls back to a generic message with the original error text', () => {
    const msg = explainDockerUnreachable(new Error('weird failure'), ep);
    expect(msg).toContain('weird failure');
    expect(msg).toContain(ep);
  });
});
