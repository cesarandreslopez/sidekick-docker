import type { ComposeClient } from 'sidekick-docker-shared';
import type { LogEntry } from 'sidekick-docker-shared';
import { ReconnectScheduler, MAX_LOG_LINES, errorMessage } from 'sidekick-docker-shared';

/**
 * Manages compose log streaming for the currently selected project/service.
 * Selection-driven: starts stream when selected, stops when deselected.
 * Auto-reconnects with exponential backoff when a stream ends.
 */
export class ComposeLogStreamManager {
  private composeClient: ComposeClient;
  private currentProject: string | null = null;
  private currentService: string | null = null;
  private logs: LogEntry[] = [];
  private aborted = false;
  private reconnect = new ReconnectScheduler();
  private onChange: () => void;

  constructor(composeClient: ComposeClient, onChange: () => void) {
    this.composeClient = composeClient;
    this.onChange = onChange;
  }

  async select(project: string | null, service: string | null): Promise<void> {
    if (project === this.currentProject && service === this.currentService) return;

    this.stop();

    this.currentProject = project;
    this.currentService = service;
    this.logs = [];

    if (!project) return;

    this.aborted = false;
    this.reconnect.reset();
    this.streamLogs(project, service);
  }

  private async streamLogs(project: string, service: string | null): Promise<void> {
    try {
      for await (const entry of this.composeClient.streamLogs(project, service ?? undefined)) {
        if (this.aborted || this.currentProject !== project) break;

        this.logs.push(entry);
        if (this.logs.length > MAX_LOG_LINES) {
          this.logs.shift();
        }

        this.onChange();
      }
      // Stream ended normally — reset backoff
      this.reconnect.reset();
    } catch (err) {
      console.debug('compose log stream error:', errorMessage(err));
    }

    // Auto-reconnect if still selected for this project
    if (!this.aborted && this.currentProject === project) {
      const scheduled = this.reconnect.schedule(() => {
        if (!this.aborted && this.currentProject === project) {
          this.streamLogs(project, service);
        }
      });
      if (!scheduled) {
        console.debug(`compose log stream: gave up reconnecting for ${project}`);
      }
    }
  }

  stop(): void {
    this.aborted = true;
    this.currentProject = null;
    this.currentService = null;
    this.reconnect.clear();
  }

  getLogs(): LogEntry[] {
    return this.logs;
  }

  dispose(): void {
    this.stop();
  }
}
