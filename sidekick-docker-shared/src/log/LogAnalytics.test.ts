import { describe, it, expect } from 'vitest';
import { LogAnalytics, detectSeverity } from './LogAnalytics';

describe('detectSeverity', () => {
  it('detects ERROR', () => {
    expect(detectSeverity('[ERROR] something broke')).toBe('error');
  });

  it('detects FATAL', () => {
    expect(detectSeverity('FATAL: system crash')).toBe('error');
  });

  it('detects WARN', () => {
    expect(detectSeverity('WARN disk space low')).toBe('warn');
  });

  it('detects WARNING', () => {
    expect(detectSeverity('[WARNING] deprecated API')).toBe('warn');
  });

  it('detects INFO', () => {
    expect(detectSeverity('INFO server started')).toBe('info');
  });

  it('detects DEBUG', () => {
    expect(detectSeverity('DEBUG processing request')).toBe('debug');
  });

  it('detects TRACE', () => {
    expect(detectSeverity('TRACE entering function')).toBe('debug');
  });

  it('returns other for unrecognized', () => {
    expect(detectSeverity('just some text')).toBe('other');
  });

  it('only checks first 200 chars', () => {
    const longLine = 'x'.repeat(250) + ' ERROR at end';
    expect(detectSeverity(longLine)).toBe('other');
  });
});

describe('LogAnalytics', () => {
  it('counts severities', () => {
    const analytics = new LogAnalytics();
    analytics.push('ERROR something');
    analytics.push('ERROR again');
    analytics.push('WARN low memory');
    analytics.push('INFO started');
    analytics.push('just text');

    const counts = analytics.getCounts();
    expect(counts.error).toBe(2);
    expect(counts.warn).toBe(1);
    expect(counts.info).toBe(1);
    expect(counts.other).toBe(1);
    expect(counts.total).toBe(5);
  });

  it('resets counts', () => {
    const analytics = new LogAnalytics();
    analytics.push('ERROR x');
    analytics.reset();
    expect(analytics.getCounts().total).toBe(0);
    expect(analytics.getCounts().error).toBe(0);
  });

  it('returns a copy of counts', () => {
    const analytics = new LogAnalytics();
    analytics.push('INFO x');
    const c1 = analytics.getCounts();
    analytics.push('INFO y');
    const c2 = analytics.getCounts();
    expect(c1.info).toBe(1);
    expect(c2.info).toBe(2);
  });
});
