import type { ContainerInfo, ContainerStats } from 'sidekick-docker-shared';
import type { PanelItem } from '../panels/types';
import type { SortField } from './dashboardTypes';

export interface OrderOptions {
  panelId: string;
  sortField: SortField;
  sortReversed: boolean;
  stats: { getLatest(id: string): ContainerStats | undefined };
}

/**
 * The side list's order. Sorting and its direction are Containers-only: the
 * reverse flag used to apply on every panel, which flipped Services so each
 * service sat under the wrong project header.
 */
export function orderItems(items: readonly PanelItem[], opts: OrderOptions): PanelItem[] {
  // Copy before sorting: the array may be the memoized/panel-owned one.
  const sorted = [...items];
  const isContainers = opts.panelId === 'containers';
  const dir = isContainers && opts.sortReversed ? -1 : 1;
  if (!isContainers || opts.sortField === 'state') {
    return sorted.sort((a, b) => dir * (a.sortKey - b.sortKey));
  }
  const latest = (item: PanelItem) => opts.stats.getLatest((item.data as ContainerInfo).id);
  return sorted.sort((a, b) => {
    switch (opts.sortField) {
      case 'name': return dir * (a.data as ContainerInfo).name.localeCompare((b.data as ContainerInfo).name);
      case 'cpu': return dir * ((latest(b)?.cpuPercent ?? 0) - (latest(a)?.cpuPercent ?? 0));
      case 'mem': return dir * ((latest(b)?.memoryPercent ?? 0) - (latest(a)?.memoryPercent ?? 0));
      case 'net': {
        const sa = latest(a);
        const sb = latest(b);
        return dir * (((sb?.networkRx ?? 0) + (sb?.networkTx ?? 0)) - ((sa?.networkRx ?? 0) + (sa?.networkTx ?? 0)));
      }
      case 'io': {
        const sa = latest(a);
        const sb = latest(b);
        return dir * (((sb?.blockRead ?? 0) + (sb?.blockWrite ?? 0)) - ((sa?.blockRead ?? 0) + (sa?.blockWrite ?? 0)));
      }
      case 'pids': return dir * ((latest(b)?.pids ?? 0) - (latest(a)?.pids ?? 0));
      default: return a.sortKey - b.sortKey;
    }
  });
}

/**
 * Where the selection belongs in the current list: on the selected item's
 * id when it is still listed, wherever a refresh, sort or filter moved it.
 * Otherwise (no id yet, or the item is gone) the old index, clamped, and that
 * row's id becomes the selection. An empty list keeps both, so the selection
 * comes back when the items do (e.g. after a reconnect).
 *
 * `replaced` is true when the selected item is gone and a neighbour takes
 * over: that is a new selection (scroll offsets and a paused follow belong to
 * the old item), unlike the same item moving or a row's id being adopted.
 */
export function resolveSelection(
  items: readonly PanelItem[],
  index: number,
  id: string | null,
): { index: number; id: string | null; replaced: boolean } {
  if (items.length === 0) return { index, id, replaced: false };
  if (id !== null) {
    const found = items.findIndex(it => it.id === id);
    if (found >= 0) return { index: found, id, replaced: false };
  }
  const clamped = Math.max(0, Math.min(index, items.length - 1));
  return { index: clamped, id: items[clamped].id, replaced: id !== null };
}

/**
 * Whether a compare pin points at an item that no longer exists. Checked
 * against the unfiltered list, so typing a filter or hiding stopped
 * containers (a) does not drop it, and never while the list is empty or
 * still loading/disconnected, when every item merely looks gone.
 */
export function isPinGone(
  pinnedId: string | null,
  allItems: readonly PanelItem[],
  listState: 'disconnected' | 'loading' | 'ready',
): boolean {
  if (pinnedId === null || listState !== 'ready' || allItems.length === 0) return false;
  return !allItems.some(it => it.id === pinnedId);
}
