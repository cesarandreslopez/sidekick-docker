import type { DockerClient } from 'sidekick-docker-shared';
import type { LogEntry, SeverityCounts, SeverityLevel, LogTemplate } from 'sidekick-docker-shared';
import { LogAnalytics, LogSeverityTimeSeries, LogTemplateEngine } from 'sidekick-docker-shared';

const MAX_LOG_LINES = 1000;

/**
 * Manages log streaming for the currently selected container.
 * Maintains a ring buffer of log entries and starts/stops streaming
 * as the selection changes. Tracks severity counts, time-series, and patterns.
 */
export class LogStreamManager {
  private client: DockerClient;
  private currentContainerId: string | null = null;
  private logs: LogEntry[] = [];
  private aborted = false;
  private streamPromise: Promise<void> | null = null;
  private onChange: () => void;
  private analytics = new LogAnalytics();
  private timeSeries = new LogSeverityTimeSeries();
  private templateEngine = new LogTemplateEngine();

  constructor(client: DockerClient, onChange: () => void) {
    this.client = client;
    this.onChange = onChange;
  }

  /** Switch to streaming logs for a different container. */
  async select(containerId: string | null): Promise<void> {
    if (containerId === this.currentContainerId) return;

    // Stop current stream
    this.stop();

    this.currentContainerId = containerId;
    this.logs = [];
    this.analytics.reset();
    this.timeSeries.reset();
    this.templateEngine.reset();

    if (!containerId) return;

    // Start new stream
    this.aborted = false;
    this.streamPromise = this.streamLogs(containerId);
  }

  private async streamLogs(containerId: string): Promise<void> {
    try {
      for await (const entry of this.client.streamLogs(containerId, {
        follow: true,
        tail: 100,
      })) {
        if (this.aborted || this.currentContainerId !== containerId) break;

        this.logs.push(entry);
        const severity = this.analytics.push(entry.message);
        this.timeSeries.push(severity);
        this.templateEngine.push(entry.message);
        if (this.logs.length > MAX_LOG_LINES) {
          this.logs.shift();
        }

        this.onChange();
      }
    } catch {
      // Stream ended or container stopped — not an error
    }
  }

  stop(): void {
    this.aborted = true;
    this.currentContainerId = null;
    this.streamPromise = null;
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
    return this.currentContainerId;
  }

  dispose(): void {
    this.stop();
  }
}
