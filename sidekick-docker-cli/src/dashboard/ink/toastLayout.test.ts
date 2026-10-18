import { describe, expect, it } from 'vitest';
import { toastDuration, wrapToast } from './toastLayout';

describe('toastDuration', () => {
  it('uses the severity base for short messages and lets callers override', () => {
    expect(toastDuration('success', 'Started web')).toBe(2000);
    expect(toastDuration('error', 'boom')).toBe(6000);
    expect(toastDuration('info', 'x', 1500)).toBe(1500);
  });

  it('gives long messages reading time, capped', () => {
    expect(toastDuration('error', 'e'.repeat(140))).toBe(11_000);
    expect(toastDuration('error', 'e'.repeat(1000))).toBe(15_000);
    expect(toastDuration('success', 's'.repeat(1000))).toBe(6000);
  });
});

describe('wrapToast', () => {
  it('wraps on words within the width', () => {
    expect(wrapToast('Stop web failed: container is not running', 20, 3)).toEqual(['Stop web failed:', 'container is not', 'running']);
  });

  it('cuts to the line budget with an ellipsis', () => {
    const lines = wrapToast('one two three four five six seven eight nine ten', 10, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith('…')).toBe(true);
    expect(lines.every(l => l.length <= 10)).toBe(true);
  });

  it('hard-breaks a word longer than the width', () => {
    expect(wrapToast('see /var/lib/docker/overlay2/abcdef', 12, 5)).toEqual(['see', '/var/lib/doc', 'ker/overlay2', '/abcdef']);
  });
});
