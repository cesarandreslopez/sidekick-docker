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

describe('buildStatusSegments under pressure (T23, A1)', () => {
  const plain = (segs: { text: string }[]) => segs.map(s => s.text).join('');
  const width = (segs: { text: string }[]) => [...plain(segs)].length;
  const disconnected = {
    ...base,
    daemonConnected: false,
    resourceErrors: { containers: 'x', images: 'x', volumes: 'x', networks: 'x' },
  };

  it('shortens the unavailable warning to a count instead of pushing ?:Help off', () => {
    for (const w of [60, 70, 77]) {
      const segs = buildStatusSegments(disconnected, w);
      expect(width(segs), `width ${w}`).toBeLessThanOrEqual(w);
      expect(plain(segs)).toContain('?:Help');
      expect(plain(segs)).toContain('⚠ 4 unavailable');
      expect(plain(segs)).toContain('disconnected');
    }
  });

  it('lists the resources when there is room', () => {
    expect(plain(buildStatusSegments(disconnected, 200))).toContain('containers, images, volumes, networks unavailable');
  });

  it('says when mouse capture is off, and keeps saying it after the action hints are dropped', () => {
    expect(plain(buildStatusSegments({ ...base, mouseEnabled: false }, 200))).toContain('mouse off');
    expect(plain(buildStatusSegments(base, 200))).not.toContain('mouse off');
    const narrow = plain(buildStatusSegments({ ...base, mouseEnabled: false }, 45));
    expect(narrow).not.toContain('s:Start');
    expect(narrow).toContain('mouse off (M)');
    expect(narrow).toContain('?:Help');
  });
});

describe('endpoint segment (T5)', () => {
  it('names a non-default endpoint and is dropped early when narrow', () => {
    const wide = text(buildStatusSegments({ ...base, endpoint: 'tcp://build:2375' }, 200));
    expect(wide).toContain('@ tcp://build:2375');
    const narrow = text(buildStatusSegments({ ...base, endpoint: 'tcp://build:2375', contextHint: 'f:Log filter' }, 75));
    expect(narrow).not.toContain('tcp://build');
    expect(narrow).toContain('?:Help');
  });

  it('is absent for the default endpoint', () => {
    expect(text(buildStatusSegments(base, 200))).not.toContain(' @ ');
  });
});
