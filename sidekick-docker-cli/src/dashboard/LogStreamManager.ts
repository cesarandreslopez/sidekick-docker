import type { DockerClient } from 'sidekick-docker-shared';
import type { LogEntry, SeverityCounts, SeverityLevel, LogTemplate } from 'sidekick-docker-shared';
import { LogAnalytics, LogSeverityTimeSeries, LogTemplateEngine, MAX_LOG_LINES } from 'sidekick-docker-shared';
import { BaseStreamManager } from './BaseStreamManager';

/**
 * Manages log streaming for the currently selected container.
 * Maintains a ring buffer of log entries and starts/stops streaming
 * as the selection changes. Tracks severity counts, time-series, and patterns.
 * Auto-reconnects when a stream ends (e.g. container restart).
 */
export class LogStreamManager extends BaseStreamManager<string | null, LogEntry> {
  private client: DockerClient;
  private logs: LogEntry[] = [];
  private analytics = new LogAnalytics();
  private timeSeries = new LogSeverityTimeSeries();
  private templateEngine = new LogTemplateEngine();

  protected readonly streamLabel = 'log';

  constructor(client: DockerClient, onChange: () => void) {
    super(onChange);
    this.client = client;
  }

  protected emptyId(): string | null { return null; }
  protected isSameId(a: string | null, b: string | null): boolean { return a === b; }
  protected isValidId(id: string | null): boolean { return id !== null; }
  protected idLabel(id: string | null): string { return id ?? '(none)'; }

  protected createStream(id: string | null): AsyncIterable<LogEntry> {
    return this.client.streamLogs(id!, { follow: true, tail: 100 });
  }

  protected processItem(_id: string | null, entry: LogEntry): void {
    this.logs.push(entry);
    const severity = this.analytics.push(entry.message);
    this.timeSeries.push(severity);
    this.templateEngine.push(entry.message);
    if (this.logs.length > MAX_LOG_LINES) {
      this.logs.shift();
    }
  }

  protected onClear(): void {
    this.logs = [];
    this.analytics.reset();
    this.timeSeries.reset();
    this.templateEngine.reset();
  }

  getLogs(): LogEntry[] {
    return this.logs;
  }

  getSeverityCounts(): SeverityCounts {
    return this.analytics.getCounts();
  }

  getSeverityTimeSeries(): { severity: SeverityLevel; total: number }[] {
    return this.timeSeries.getDominantSeries();
  }

  getTemplates(limit = 20): LogTemplate[] {
    return this.templateEngine.getTemplates(limit);
  }

  getCurrentContainerId(): string | null {
    return this.currentId;
  }
}
