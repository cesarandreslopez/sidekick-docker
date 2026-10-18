import { describe, expect, it } from 'vitest';
import { buildStatusSegments } from './StatusBar';

const base = {
  daemonConnected: true,
  focusTarget: 'side' as const,
  panelActionHints: [{ key: 's', label: 'Start', destructive: false }, { key: 'd', label: 'Remove', destructive: true }],
  filterString: '',
  containerCount: 5,
  runningCount: 3,
  version: '0.5.0',
};
const text = (segs: { text: string }[]) => segs.map(s => s.text).join('');

describe('buildStatusSegments', () => {
  it('keeps ?:Help even when everything optional is dropped', () => {
    const narrow = buildStatusSegments(base, 30);
    expect(text(narrow)).toContain('?:Help');
    expect(text(narrow)).not.toContain('Start');
  });

  it('shows the full bar when it fits', () => {
    const wide = text(buildStatusSegments(base, 200));
    expect(wide).toContain('3/5');
    expect(wide).toContain('s:Start');
    expect(wide).toContain('?:Help');
  });

  it('points at Ctrl+R once the data is stale', () => {
    const stale = text(buildStatusSegments({ ...base, lastRefresh: new Date(Date.now() - 5 * 60_000) }, 200));
    expect(stale).toContain('5m ago (Ctrl+R)');
    const fresh = text(buildStatusSegments({ ...base, lastRefresh: new Date() }, 200));
    expect(fresh).not.toContain('Ctrl+R');
  });
});
