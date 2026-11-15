import { describe, it, expect } from 'vitest';
import { orderItems, resolveSelection, isPinGone } from './listModel';
import type { PanelItem } from '../panels/types';

const item = (id: string, sortKey: number, data: unknown = {}): PanelItem => ({ id, label: id, sortKey, data });
const noStats = { getLatest: () => undefined };

describe('orderItems (T5)', () => {
  const services = [item('project:shop', 0), item('service:shop:web', 1), item('service:shop:db', 2), item('project:blog', 3)];

  it('ignores the reverse flag outside Containers, so services stay under their project', () => {
    const ordered = orderItems(services, { panelId: 'services', sortField: 'state', sortReversed: true, stats: noStats });
    expect(ordered.map(i => i.id)).toEqual(['project:shop', 'service:shop:web', 'service:shop:db', 'project:blog']);
  });

  it('reverses the state order on Containers (stopped first)', () => {
    const containers = [item('a', 0), item('b', 1), item('c', 0)];
    const ordered = orderItems(containers, { panelId: 'containers', sortField: 'state', sortReversed: true, stats: noStats });
    expect(ordered.map(i => i.id)).toEqual(['b', 'a', 'c']);
  });

  it('sorts Containers by a stats field, highest first unless reversed', () => {
    const containers = [item('a', 0, { id: 'a', name: 'a' }), item('b', 0, { id: 'b', name: 'b' })];
    const stats = { getLatest: (id: string) => ({ cpuPercent: id === 'b' ? 50 : 5 }) as never };
    expect(orderItems(containers, { panelId: 'containers', sortField: 'cpu', sortReversed: false, stats }).map(i => i.id)).toEqual(['b', 'a']);
    expect(orderItems(containers, { panelId: 'containers', sortField: 'cpu', sortReversed: true, stats }).map(i => i.id)).toEqual(['a', 'b']);
  });

  it('does not mutate the input array', () => {
    const input = [item('b', 1), item('a', 0)];
    orderItems(input, { panelId: 'images', sortField: 'state', sortReversed: false, stats: noStats });
    expect(input.map(i => i.id)).toEqual(['b', 'a']);
  });
});

describe('resolveSelection (T3)', () => {
  const list = [item('a', 0), item('b', 1), item('c', 2)];

  it('follows the selected item to its new index after a reorder', () => {
    expect(resolveSelection([list[2], list[0], list[1]], 0, 'a')).toEqual({ index: 1, id: 'a', replaced: false });
  });

  it('records the id of the row at the index when none is known yet', () => {
    expect(resolveSelection(list, 1, null)).toEqual({ index: 1, id: 'b', replaced: false });
  });

  it('falls back to the clamped index when the item is gone, as a replacement', () => {
    // replaced: the caller treats this as a new selection (SELECT_ITEM), so
    // the old item's scroll offsets and paused follow do not carry over.
    expect(resolveSelection([list[0], list[1]], 2, 'c')).toEqual({ index: 1, id: 'b', replaced: true });
    expect(resolveSelection([list[0], list[2]], 1, 'b')).toEqual({ index: 1, id: 'c', replaced: true });
  });

  it('keeps everything while the list is empty, so the selection returns with the items', () => {
    expect(resolveSelection([], 2, 'c')).toEqual({ index: 2, id: 'c', replaced: false });
  });
});

describe('isPinGone (T1)', () => {
  const all = [item('a', 0), item('b', 1)];

  it('is true only when the pinned item has left the unfiltered list', () => {
    expect(isPinGone('a', all, 'ready')).toBe(false);
    expect(isPinGone('z', all, 'ready')).toBe(true);
    expect(isPinGone(null, all, 'ready')).toBe(false);
  });

  it('never drops the pin while the list is empty, loading or disconnected', () => {
    expect(isPinGone('z', [], 'ready')).toBe(false);
    expect(isPinGone('z', all, 'loading')).toBe(false);
    expect(isPinGone('z', all, 'disconnected')).toBe(false);
  });
});
