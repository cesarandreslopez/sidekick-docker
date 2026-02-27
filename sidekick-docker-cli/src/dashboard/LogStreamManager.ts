import type { DockerClient } from 'sidekick-docker-shared';
import type { LogEntry } from 'sidekick-docker-shared';

const MAX_LOG_LINES = 1000;

/**
 * Manages log streaming for the currently selected container.
 * Maintains a ring buffer of log entries and starts/stops streaming
 * as the selection changes.
 */
export class LogStreamManager {
  private client: DockerClient;
  private currentContainerId: string | null = null;
  private logs: LogEntry[] = [];
  private aborted = false;
  private streamPromise: Promise<void> | null = null;
  private onChange: () => void;

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

  getCurrentContainerId(): string | null {
    return this.currentContainerId;
  }

  dispose(): void {
    this.stop();
  }
}
