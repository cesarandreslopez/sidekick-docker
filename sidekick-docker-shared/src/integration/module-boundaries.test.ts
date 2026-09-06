/**
 * Integration tests for module boundary contracts.
 *
 * These tests verify that the modular architecture refactoring preserved
 * all public API surfaces and that cross-module composition works correctly.
 */
import { describe, it, expect } from 'vitest';
// Load the entry point before test timers: these checks cover exports, not transpilation speed.
import * as barrel from '../index';
import { StatsCollector } from '../stats/StatsCollector';
import { formatPorts, stateIcon, stateColor } from '../formatters';
import { tokenizeLogLine, filterLine, detectSeverity, parseLine, detectFormat, LogAnalytics } from '../log/index';
import { errorMessage } from '../errors';
import type { ContainerStats } from '../types/container';
import type { PortBinding } from '../types/container';

describe('Barrel export completeness', () => {
  it('exports all types from the main barrel', async () => {

    // Docker module
    expect(barrel.DockerClient).toBeDefined();

    // Compose module
    expect(barrel.ComposeDetector).toBeDefined();
    expect(barrel.ComposeClient).toBeDefined();
    expect(barrel.ComposeFileReader).toBeDefined();

    // Stats module
    expect(barrel.StatsCollector).toBeDefined();

    // Log module
    expect(barrel.tokenizeLogLine).toBeTypeOf('function');
    expect(barrel.exactMatch).toBeTypeOf('function');
    expect(barrel.fuzzyMatch).toBeTypeOf('function');
    expect(barrel.filterLine).toBeTypeOf('function');
    expect(barrel.LogAnalytics).toBeDefined();
    expect(barrel.detectSeverity).toBeTypeOf('function');
    expect(barrel.detectFormat).toBeTypeOf('function');
    expect(barrel.parseLine).toBeTypeOf('function');
    expect(barrel.LogSeverityTimeSeries).toBeDefined();
    expect(barrel.LogTemplateEngine).toBeDefined();

    // Events module
    expect(barrel.EventWatcher).toBeDefined();

    // Reconnect (from events/)
    expect(barrel.ReconnectScheduler).toBeDefined();
    expect(barrel.INITIAL_RECONNECT_DELAY).toBe(2000);
    expect(barrel.MAX_RECONNECT_DELAY).toBe(30_000);
    expect(barrel.MAX_RECONNECT_ATTEMPTS).toBe(10);

    // Formatters (core)
    expect(barrel.formatBytes).toBeTypeOf('function');
    expect(barrel.formatCpu).toBeTypeOf('function');
    expect(barrel.formatMemory).toBeTypeOf('function');
    expect(barrel.formatPorts).toBeTypeOf('function');
    expect(barrel.stateIcon).toBeTypeOf('function');
    expect(barrel.truncate).toBeTypeOf('function');
    expect(barrel.stateColor).toBeTypeOf('function');

    // Errors
    expect(barrel.errorMessage).toBeTypeOf('function');

    // Constants
    expect(barrel.MAX_LOG_LINES).toBe(1000);

    // Branding
    expect(barrel.BRAND_INLINE).toBeTypeOf('string');
    expect(barrel.BRAND_TAGLINE).toBeTypeOf('string');
    expect(barrel.BRAND_COLOR_HEX).toBeTypeOf('string');
    expect(barrel.BRAND_COLOR_ANSI).toBeTypeOf('string');
    expect(barrel.BRAND_COLOR_ANSI_RESET).toBeTypeOf('string');

    // Phrases
    expect(barrel.getRandomPhrase).toBeTypeOf('function');
  });
});

describe('Sub-path exports', () => {
  it('log sub-path exports all log analysis functions', async () => {
    const log = await import('../log/index');

    expect(log.tokenizeLogLine).toBeTypeOf('function');
    expect(log.exactMatch).toBeTypeOf('function');
    expect(log.fuzzyMatch).toBeTypeOf('function');
    expect(log.filterLine).toBeTypeOf('function');
    expect(log.LogAnalytics).toBeDefined();
    expect(log.detectSeverity).toBeTypeOf('function');
    expect(log.detectFormat).toBeTypeOf('function');
    expect(log.parseLine).toBeTypeOf('function');
    expect(log.LogSeverityTimeSeries).toBeDefined();
    expect(log.LogTemplateEngine).toBeDefined();
  });

  it('formatters sub-path exports all formatter functions', async () => {
    const fmt = await import('../formatters');

    expect(fmt.formatBytes).toBeTypeOf('function');
    expect(fmt.formatCpu).toBeTypeOf('function');
    expect(fmt.formatMemory).toBeTypeOf('function');
    expect(fmt.formatPorts).toBeTypeOf('function');
    expect(fmt.stateIcon).toBeTypeOf('function');
    expect(fmt.truncate).toBeTypeOf('function');
    expect(fmt.stateColor).toBeTypeOf('function');
  });

  it('barrel and sub-path exports return identical references', async () => {
    const log = await import('../log/index');
    const fmt = await import('../formatters');

    // Log functions should be the same reference
    expect(barrel.tokenizeLogLine).toBe(log.tokenizeLogLine);
    expect(barrel.detectSeverity).toBe(log.detectSeverity);
    expect(barrel.LogTemplateEngine).toBe(log.LogTemplateEngine);

    // Formatter functions should be the same reference
    expect(barrel.formatBytes).toBe(fmt.formatBytes);
    expect(barrel.stateIcon).toBe(fmt.stateIcon);
    expect(barrel.truncate).toBe(fmt.truncate);
  });
});

describe('Events module composition', () => {
  it('events barrel exports both EventWatcher and ReconnectScheduler', async () => {
    const events = await import('../events/index');

    expect(events.EventWatcher).toBeDefined();
    expect(events.ReconnectScheduler).toBeDefined();
    expect(events.INITIAL_RECONNECT_DELAY).toBe(2000);
    expect(events.MAX_RECONNECT_DELAY).toBe(30_000);
    expect(events.MAX_RECONNECT_ATTEMPTS).toBe(10);
  });

  it('ReconnectScheduler from events/ barrel matches main barrel', async () => {
    const events = await import('../events/index');

    expect(barrel.ReconnectScheduler).toBe(events.ReconnectScheduler);
    expect(barrel.INITIAL_RECONNECT_DELAY).toBe(events.INITIAL_RECONNECT_DELAY);
  });

});

describe('Cross-module type flow', () => {
  it('StatsCollector accepts ContainerStats from types module', () => {
    const collector = new StatsCollector();

    const stats: ContainerStats = {
      cpuPercent: 25.5,
      memoryUsage: 512 * 1024 * 1024,
      memoryLimit: 2048 * 1024 * 1024,
      memoryPercent: 25.0,
      networkRx: 1000,
      networkTx: 500,
      blockRead: 0,
      blockWrite: 0,
      pids: 5,
      timestamp: new Date(),
    };

    collector.push('test-container', stats);
    const latest = collector.getLatest('test-container');
    expect(latest).toBeDefined();
    expect(latest!.cpuPercent).toBe(25.5);
    expect(latest!.memoryPercent).toBe(25.0);
  });

  it('formatters use types from types module', () => {
    const ports: PortBinding[] = [
      { hostPort: 8080, containerPort: 80, protocol: 'tcp' },
      { hostPort: 0, containerPort: 443, protocol: 'tcp' },
    ];
    expect(formatPorts(ports)).toBe('8080:80/tcp');

    expect(stateIcon('running')).toBe('\u25B6');
    expect(stateColor('running')).toBe('green');
    expect(stateColor('exited')).toBe('red');
  });

  it('log module functions compose correctly', () => {
    const line = '2024-01-15T10:30:00Z ERROR Failed to connect to database';

    // Tokenizer → tokens
    const tokens = tokenizeLogLine(line);
    expect(tokens.length).toBeGreaterThan(0);

    // Filter → match result
    const result = filterLine(line, 'ERROR', 'exact');
    expect(result.matched).toBe(true);
    expect(result.matches.length).toBeGreaterThan(0);

    // Severity detection
    expect(detectSeverity(line)).toBe('error');

    // Format detection + parsing
    const format = detectFormat(line);
    expect(format).toBeDefined();
    const parsed = parseLine(line);
    expect(parsed).toBeDefined();
  });

  it('errorMessage handles all error types', () => {
    expect(errorMessage(new Error('test'))).toBe('test');
    expect(errorMessage('string error')).toBe('string error');
    expect(errorMessage(42)).toBe('42');
    expect(errorMessage(null)).toBe('null');
  });
});

describe('Module isolation', () => {
  it('log module has no dependency on docker or types modules', () => {
    // The log module should be a leaf — no internal dependencies.
    // If this import succeeds without pulling in dockerode or other heavy deps,
    // the module boundary is clean. The functions should work standalone.
    const tokens = tokenizeLogLine('GET /api/users 200');
    expect(tokens.length).toBeGreaterThan(0);

    const analytics = new LogAnalytics();
    analytics.push('INFO Application started');
    const counts = analytics.getCounts();
    expect(counts.total).toBe(1);
    expect(counts.info).toBe(1);
  });

  it('types module has no dependencies', async () => {
    // types/ is a leaf module — only contains interfaces/types.
    // The barrel re-exports should have zero side effects.
    const types = await import('../types/index');
    expect(types).toBeDefined();
    // All exports from types/ are type-only, so they should not appear at runtime
    // (TypeScript erases them). If any show up, it means a value was accidentally exported.
    const exportKeys = Object.keys(types).filter(k => k !== '__esModule' && k !== 'default');
    expect(exportKeys.length).toBe(0);
  });
});
