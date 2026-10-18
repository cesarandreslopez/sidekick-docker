import { describe, expect, it, vi } from 'vitest';
import { collectLogText, copyLogsAction } from './types';
import type { DockerDashboardMetrics } from '../DockerState';
import type { LogEntry } from 'sidekick-docker-shared';

const log = (message: string): LogEntry => ({ timestamp: null, stream: 'stdout', message });
const LOGS = [log('GET /health 200'), log('ERROR db timeout'), log('GET / 200'), log('error: retrying')];

describe('collectLogText', () => {
  it('returns every line without a filter', () => {
    expect(collectLogText(LOGS, '', 'exact')).toEqual({ text: LOGS.map(l => l.message).join('\n'), count: 4 });
  });

  it('returns only the lines the filter shows', () => {
    expect(collectLogText(LOGS, 'error', 'exact').count).toBe(2);
    expect(collectLogText(LOGS, 'error', 'exact').text).toContain('db timeout');
  });
});

describe('copyLogsAction', () => {
  it('copies the filtered buffer and reports the line count', () => {
    const copy = vi.fn(() => true);
    const metrics = { selectedContainerLogs: LOGS, logFilterString: 'GET', logFilterMode: 'exact' } as unknown as DockerDashboardMetrics;
    const action = copyLogsAction(() => metrics, m => m.selectedContainerLogs, () => copy);
    expect(action.handler({ id: 'x', label: '', sortKey: 0, data: null })).toBe('Copied 2 lines');
    expect(copy).toHaveBeenCalledWith('GET /health 200\nGET / 200');
  });

  it('explains a missing clipboard tool', () => {
    const metrics = { selectedContainerLogs: LOGS, logFilterString: '', logFilterMode: 'exact' } as unknown as DockerDashboardMetrics;
    const action = copyLogsAction(() => metrics, m => m.selectedContainerLogs, () => () => false);
    expect(() => action.handler({ id: 'x', label: '', sortKey: 0, data: null })).toThrow(/clipboard/);
  });
});
