import type { ComposeClient } from 'sidekick-docker-shared';
import type { LogEntry } from 'sidekick-docker-shared';

const MAX_LOG_LINES = 1000;

/**
 * Manages compose log streaming for the currently selected project/service.
 * Selection-driven: starts stream when selected, stops when deselected.
 */
export class ComposeLogStreamManager {
  private composeClient: ComposeClient;
  private currentProject: string | null = null;
  private currentService: string | null = null;
  private logs: LogEntry[] = [];
  private aborted = false;
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
    } catch {
      // Stream ended — not an error
    }
  }

  stop(): void {
    this.aborted = true;
    this.currentProject = null;
    this.currentService = null;
  }

  getLogs(): LogEntry[] {
    return this.logs;
  }

  dispose(): void {
    this.stop();
  }
}
