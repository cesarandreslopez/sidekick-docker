import type { DockerClient } from 'sidekick-docker-shared';
import type { LogEntry, SeverityCounts, SeverityLevel, LogTemplate, FollowStreamState } from 'sidekick-docker-shared';
import { LogAnalytics, LogResumeCursor, LogSeverityTimeSeries, LogTemplateEngine, MAX_LOG_LINES } from 'sidekick-docker-shared';
import { BaseStreamManager } from './BaseStreamManager';
import type { StreamManagerOptions } from './BaseStreamManager';

/**
 * Manages log streaming for the currently selected container.
 * Maintains a ring buffer of log entries and starts/stops streaming
 * as the selection changes. Tracks severity counts, time-series, and patterns.
 * Reconnects resume from the last timestamp seen, so a restart does not
 * append the tail a second time; a stopped container's stream just ends.
 */
export class LogStreamManager extends BaseStreamManager<string | null, LogEntry> {
  private client: DockerClient;
  private logs: LogEntry[] = [];
  private analytics = new LogAnalytics();
  private timeSeries = new LogSeverityTimeSeries();
  private templateEngine = new LogTemplateEngine();
  private cursor = new LogResumeCursor();

  protected readonly streamLabel = 'log';

  constructor(client: DockerClient, onChange: () => void, options: StreamManagerOptions<string | null> = {}) {
    super(onChange, options);
    this.client = client;
  }

  protected emptyId(): string | null { return null; }
  protected isSameId(a: string | null, b: string | null): boolean { return a === b; }
  protected isValidId(id: string | null): boolean { return id !== null; }
  protected idLabel(id: string | null): string { return id ?? '(none)'; }

  protected createStream(id: string | null, signal: AbortSignal, attempt: { reconnect: boolean }): AsyncIterable<LogEntry> {
    if (attempt.reconnect) this.cursor.beginResume();
    const since = attempt.reconnect ? this.cursor.sinceSeconds() : undefined;
    return this.client.streamLogs(id!, since === undefined ? { follow: true, tail: 100 } : { follow: true, tail: MAX_LOG_LINES, since }, signal);
  }

  protected acceptItem(entry: LogEntry): boolean {
    return !this.cursor.isReplay(entry);
  }

  protected processItem(_id: string | null, entry: LogEntry): void {
    this.cursor.observe(entry);
    this.logs.push(entry);
    const severity = this.analytics.push(entry.message);
    this.timeSeries.push(severity);
    this.templateEngine.push(entry.message);
    if (this.logs.length > MAX_LOG_LINES) {
      this.logs.shift();
    }
  }

  /**
   * Repaint on lifecycle changes too: an empty Logs tab says whether the
   * stream is connecting, ended (target stopped) or lost. 'live' is followed
   * by the item that caused it, which repaints anyway.
   */
  protected onStreamState(state: FollowStreamState): void {
    if (state !== 'live') this.onChange();
  }

  protected onClear(): void {
    this.logs = [];
    this.cursor.reset();
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

  getTemplateDiagnostics() {
    return this.templateEngine.getDiagnostics();
  }
}
