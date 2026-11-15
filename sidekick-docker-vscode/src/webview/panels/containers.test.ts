import { describe, expect, it } from 'vitest';
import { containersPanel, splitReplicaSuffix } from './containers';
import { CONTAINER_FILES_TAB_INDEX } from '../../types/detailTabs';

describe('containersPanel', () => {
  it('has the Files tab where the host expects it (refresh re-reads that tab by index)', () => {
    expect(containersPanel.detailTabs[CONTAINER_FILES_TAB_INDEX]?.label).toBe('Files');
  });
});

describe('splitReplicaSuffix', () => {
  it('keeps a replica number visible when the list ellipsizes the name', () => {
    expect(splitReplicaSuffix('shop-checkout-worker-2')).toEqual({ label: 'shop-checkout-worker', labelTail: '-2' });
    expect(splitReplicaSuffix('postgres')).toEqual({ label: 'postgres' });
    expect(splitReplicaSuffix('-1')).toEqual({ label: '-1' });
  });
});
