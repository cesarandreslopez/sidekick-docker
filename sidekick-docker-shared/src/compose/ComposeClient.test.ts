import { describe, it, expect } from 'vitest';
import { ComposeError, composeFailureReason, throwIfComposeFailed } from './ComposeClient';
import type { ComposeExecResult } from './ComposeClient';

function result(over: Partial<ComposeExecResult> = {}): ComposeExecResult {
  return { exitCode: 0, stdout: '', stderr: '', ...over };
}

describe('throwIfComposeFailed', () => {
  it('passes a successful run through unchanged', () => {
    const ok = result({ stdout: 'done' });
    expect(throwIfComposeFailed(ok, 'Up')).toBe(ok);
  });

  it('throws on a non-zero exit', () => {
    // The bug this guards: every call site dropped the result, so a failed
    // `docker compose up` still rendered the success toast.
    const failed = result({ exitCode: 1, stderr: 'Error: no such service: web' });
    expect(() => throwIfComposeFailed(failed, 'Up')).toThrow(ComposeError);
    expect(() => throwIfComposeFailed(failed, 'Up')).toThrow(/no such service: web/);
  });

  it('does not embed the action in the message', () => {
    // Both frontends render `${label} failed: ${errorMessage(err)}`, so an
    // action baked into the message came out as "Up failed: Up failed: …".
    const failed = result({ exitCode: 1, stderr: 'Error: no such service: web' });
    try {
      throwIfComposeFailed(failed, 'Up');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as ComposeError).message).toBe('Error: no such service: web');
      expect((err as ComposeError).message).not.toMatch(/failed:/);
      expect((err as ComposeError).action).toBe('Up');
    }
  });

  it('carries the exit code and raw stderr on the error', () => {
    const failed = result({ exitCode: 17, stderr: 'boom' });
    try {
      throwIfComposeFailed(failed, 'Down');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ComposeError);
      expect((err as ComposeError).exitCode).toBe(17);
      expect((err as ComposeError).stderr).toBe('boom');
      expect((err as ComposeError).action).toBe('Down');
    }
  });
});

describe('composeFailureReason', () => {
  it('prefers a line that announces an error over trailing progress noise', () => {
    // compose writes progress to stderr even while failing, so the last line
    // is usually " Container x  Stopping" rather than the actual cause.
    const failed = result({
      exitCode: 1,
      stderr: [
        ' Container api-1  Creating',
        'Error response from daemon: driver failed programming external connectivity',
        ' Container api-1  Removing',
      ].join('\n'),
    });
    expect(composeFailureReason(failed)).toContain('Error response from daemon');
  });

  it('matches other failure phrasings docker uses', () => {
    expect(composeFailureReason(result({ exitCode: 1, stderr: 'no such service: web' })))
      .toBe('no such service: web');
    expect(composeFailureReason(result({ exitCode: 1, stderr: 'service "db" failed to build' })))
      .toBe('service "db" failed to build');
    expect(composeFailureReason(result({ exitCode: 1, stderr: 'cannot start service api' })))
      .toBe('cannot start service api');
  });

  it('falls back to the last line when nothing looks like an error', () => {
    const failed = result({ exitCode: 2, stderr: 'first\nsecond\n' });
    expect(composeFailureReason(failed)).toBe('second');
  });

  it('falls back to the exit code when stderr is empty', () => {
    expect(composeFailureReason(result({ exitCode: 3 }))).toBe('exit code 3');
    expect(composeFailureReason(result({ exitCode: 3, stderr: '  \n \n' }))).toBe('exit code 3');
  });
});
