import { describe, expect, it } from 'vitest';
import { containersPanel } from './containers';
import { CONTAINER_FILES_TAB_INDEX } from '../../types/detailTabs';

describe('containersPanel', () => {
  it('has the Files tab where the host expects it (refresh re-reads that tab by index)', () => {
    expect(containersPanel.detailTabs[CONTAINER_FILES_TAB_INDEX]?.label).toBe('Files');
  });
});
