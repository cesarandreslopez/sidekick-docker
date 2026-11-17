import { describe, expect, it, vi } from 'vitest';
import { collectLogText, copyLogsAction, emptyStatsMessage, itemName } from './types';
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

  it('copies plain text: no colour codes or control characters (Missed-5)', () => {
    const coloured = [log('\x1b[32mINFO\x1b[0m\tready\r'), log('\x1b[31mERROR\x1b[0m boom\x07')];
    expect(collectLogText(coloured, '', 'exact').text).toBe('INFO    ready\nERROR boom');
    // The filter sees the same plain text, across the colour boundary.
    expect(collectLogText(coloured, 'ERROR boom', 'exact').count).toBe(1);
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

  it('does not claim a copy the terminal cannot confirm (OSC 52)', () => {
    const metrics = { selectedContainerLogs: LOGS, logFilterString: 'GET', logFilterMode: 'exact' } as unknown as DockerDashboardMetrics;
    const action = copyLogsAction(() => metrics, m => m.selectedContainerLogs, () => () => 'terminal' as const);
    expect(action.handler({ id: 'x', label: '', sortKey: 0, data: null })).toBe("Sent 2 lines to the terminal's clipboard");
  });

  it('explains a missing clipboard tool', () => {
    const metrics = { selectedContainerLogs: LOGS, logFilterString: '', logFilterMode: 'exact' } as unknown as DockerDashboardMetrics;
    const action = copyLogsAction(() => metrics, m => m.selectedContainerLogs, () => () => false);
    expect(() => action.handler({ id: 'x', label: '', sortKey: 0, data: null })).toThrow(/clipboard/);
  });
});

describe('copyLogsAction refuses to copy nothing (T12)', () => {
  it('throws before touching the clipboard when the buffer is empty', () => {
    const copy = vi.fn(() => true);
    const metrics = { selectedContainerLogs: [], logFilterString: '', logFilterMode: 'exact' } as unknown as DockerDashboardMetrics;
    const action = copyLogsAction(() => metrics, m => m.selectedContainerLogs, () => copy);
    expect(() => action.handler({ id: 'x', label: '', sortKey: 0, data: null })).toThrow(/no log lines/);
    expect(copy).not.toHaveBeenCalled();
  });

  it('says so when the filter matches nothing', () => {
    const copy = vi.fn(() => true);
    const metrics = { selectedContainerLogs: LOGS, logFilterString: 'nomatch', logFilterMode: 'exact' } as unknown as DockerDashboardMetrics;
    const action = copyLogsAction(() => metrics, m => m.selectedContainerLogs, () => copy);
    expect(() => action.handler({ id: 'x', label: '', sortKey: 0, data: null })).toThrow('no log lines match "nomatch"');
    expect(copy).not.toHaveBeenCalled();
  });
});

describe('copyLogsAction off the Logs tab (Services)', () => {
  it('says to open the Logs tab when nothing is streaming the buffer', () => {
    const copy = vi.fn(() => true);
    const idle = { selectedComposeLogs: [], logFilterString: '', logFilterMode: 'exact', composeLogStreamState: null } as unknown as DockerDashboardMetrics;
    const action = copyLogsAction(() => idle, m => m.selectedComposeLogs, () => copy, m => m.composeLogStreamState);
    expect(() => action.handler({ id: 'x', label: '', sortKey: 0, data: null })).toThrow('open the Logs tab first');
    const live = { ...idle, composeLogStreamState: 'loading' } as unknown as DockerDashboardMetrics;
    const onLogs = copyLogsAction(() => live, m => m.selectedComposeLogs, () => copy, m => m.composeLogStreamState);
    expect(() => onLogs.handler({ id: 'x', label: '', sortKey: 0, data: null })).toThrow('no log lines to copy yet');
    expect(copy).not.toHaveBeenCalled();
  });
});

describe('emptyStatsMessage (Missed-3)', () => {
  it('says why the Stats tab is empty instead of loading forever', () => {
    expect(emptyStatsMessage(null)).toBe('Loading stats…');
    expect(emptyStatsMessage('loading')).toBe('Loading stats…');
    expect(emptyStatsMessage('reconnecting')).toContain('reconnecting');
    expect(emptyStatsMessage('ended')).toContain('ended');
    expect(emptyStatsMessage('error')).toContain('lost');
  });
});

describe('itemName (T26)', () => {
  it('prefers the plain name over the decorated label', () => {
    expect(itemName({ id: 'c', label: '● web :8080', name: 'web', sortKey: 0, data: null })).toBe('web');
    expect(itemName({ id: 'v', label: '○ pgdata', sortKey: 0, data: null })).toBe('pgdata');
  });
});
