import { describe, expect, it } from 'vitest';
import { queueToast } from './toastLayout';
import type { ToastEntry, ToastSeverity } from './dashboardTypes';

const t = (id: number, message: string, extra: { severity?: ToastSeverity; progress?: boolean } = {}): ToastEntry =>
  ({ id, message, severity: extra.severity ?? 'info', progress: extra.progress ?? false });

describe('queueToast (T17)', () => {
  it('collapses the same message and severity into the newest copy', () => {
    const q = queueToast([t(1, 'Not available here', { severity: 'warning' }), t(2, 'Refreshed')], t(3, 'Not available here', { severity: 'warning' }), 5);
    expect(q.map(x => x.id)).toEqual([2, 3]);
    // A different severity is a different toast.
    expect(queueToast([t(1, 'x', { severity: 'warning' })], t(2, 'x', { severity: 'error' }), 5)).toHaveLength(2);
  });

  it('evicts the oldest finished toast before any progress spinner', () => {
    const spinner = t(1, 'Restarting web', { progress: true });
    const q = queueToast([spinner, t(2, 'a'), t(3, 'b')], t(4, 'c'), 3);
    expect(q.map(x => x.id)).toEqual([1, 3, 4]);
  });

  it('falls back to the oldest when every toast is a spinner', () => {
    const q = queueToast([t(1, 'a', { progress: true }), t(2, 'b', { progress: true })], t(3, 'c', { progress: true }), 2);
    expect(q.map(x => x.id)).toEqual([2, 3]);
  });

  it('never collapses two spinners', () => {
    expect(queueToast([t(1, 'Pruning', { progress: true })], t(2, 'Pruning', { progress: true }), 5)).toHaveLength(2);
  });
});
