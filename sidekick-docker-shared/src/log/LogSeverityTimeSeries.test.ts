import { describe, it, expect } from 'vitest';
import { LogSeverityTimeSeries } from './LogSeverityTimeSeries';

describe('LogSeverityTimeSeries', () => {
  it('creates buckets as events arrive', () => {
    const ts = new LogSeverityTimeSeries(60, 60_000);
    const now = Date.now();
    ts.push('error', now);
    ts.push('warn', now);
    ts.push('info', now);

    const buckets = ts.getBuckets();
    expect(buckets.length).toBe(1);
    expect(buckets[0].error).toBe(1);
    expect(buckets[0].warn).toBe(1);
    expect(buckets[0].info).toBe(1);
  });

  it('creates new buckets for different time windows', () => {
    const ts = new LogSeverityTimeSeries(60, 60_000);
    const now = Date.now();
    ts.push('error', now);
    ts.push('error', now + 60_001); // next bucket

    const buckets = ts.getBuckets();
    expect(buckets.length).toBe(2);
  });

  it('limits bucket count to maxBuckets', () => {
    const ts = new LogSeverityTimeSeries(3, 1_000);
    const now = Date.now();
    ts.push('info', now);
    ts.push('info', now + 1_001);
    ts.push('info', now + 2_001);
    ts.push('info', now + 3_001); // should evict the first

    const buckets = ts.getBuckets();
    expect(buckets.length).toBe(3);
  });

  it('computes dominant severity series', () => {
    const ts = new LogSeverityTimeSeries(60, 60_000);
    const now = Date.now();
    ts.push('error', now);
    ts.push('error', now);
    ts.push('info', now);

    const series = ts.getDominantSeries();
    expect(series.length).toBe(1);
    expect(series[0].severity).toBe('error');
    expect(series[0].total).toBe(3);
  });

  it('computes total series', () => {
    const ts = new LogSeverityTimeSeries(60, 60_000);
    const now = Date.now();
    ts.push('error', now);
    ts.push('warn', now);
    ts.push('info', now);

    const totals = ts.getTotalSeries();
    expect(totals).toEqual([3]);
  });

  it('resets all data', () => {
    const ts = new LogSeverityTimeSeries();
    ts.push('error');
    ts.reset();
    expect(ts.getBuckets().length).toBe(0);
  });
});
