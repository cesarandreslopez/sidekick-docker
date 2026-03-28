import type { ComposeClient } from 'sidekick-docker-shared';
import type { LogEntry } from 'sidekick-docker-shared';
import { MAX_LOG_LINES } from 'sidekick-docker-shared';
import { BaseStreamManager } from './BaseStreamManager';

interface ComposeStreamId {
  project: string | null;
  service: string | null;
}

/**
 * Manages compose log streaming for the currently selected project/service.
 * Selection-driven: starts stream when selected, stops when deselected.
 * Auto-reconnects with exponential backoff when a stream ends.
 */
export class ComposeLogStreamManager extends BaseStreamManager<ComposeStreamId, LogEntry> {
  private composeClient: ComposeClient;
  private logs: LogEntry[] = [];

  protected readonly streamLabel = 'compose log';

  constructor(composeClient: ComposeClient, onChange: () => void) {
    super(onChange);
    this.composeClient = composeClient;
  }

  protected emptyId(): ComposeStreamId { return { project: null, service: null }; }
  protected isSameId(a: ComposeStreamId, b: ComposeStreamId): boolean {
    return a.project === b.project && a.service === b.service;
  }
  protected isValidId(id: ComposeStreamId): boolean { return id.project !== null; }
  protected idLabel(id: ComposeStreamId): string { return id.project ?? '(none)'; }

  protected createStream(id: ComposeStreamId, signal: AbortSignal): AsyncIterable<LogEntry> {
    return this.composeClient.streamLogs(id.project!, id.service ?? undefined, 100, signal);
  }

  protected processItem(_id: ComposeStreamId, entry: LogEntry): void {
    this.logs.push(entry);
    if (this.logs.length > MAX_LOG_LINES) {
      this.logs.shift();
    }
  }

  protected onClear(): void {
    this.logs = [];
  }

  /** Select by project/service (convenience wrapper). */
  async selectCompose(project: string | null, service: string | null): Promise<void> {
    return this.select({ project, service });
  }

  getLogs(): LogEntry[] {
    return this.logs;
  }
}
