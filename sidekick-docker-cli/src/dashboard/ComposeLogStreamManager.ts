import type { ComposeClient } from 'sidekick-docker-shared';
import type { LogEntry, FollowStreamState } from 'sidekick-docker-shared';
import { LogResumeCursor, MAX_LOG_LINES } from 'sidekick-docker-shared';
import { BaseStreamManager } from './BaseStreamManager';
import type { StreamManagerOptions } from './BaseStreamManager';

export interface ComposeStreamId {
  project: string | null;
  service: string | null;
}

/**
 * Manages compose log streaming for the currently selected project/service.
 * Selection-driven: starts stream when selected, stops when deselected.
 * Reconnects resume from the last timestamp seen (`--since`); a stopped
 * project's stream just ends.
 */
export class ComposeLogStreamManager extends BaseStreamManager<ComposeStreamId, LogEntry> {
  private composeClient: ComposeClient;
  private logs: LogEntry[] = [];
  private cursor = new LogResumeCursor();

  protected readonly streamLabel = 'compose log';

  constructor(composeClient: ComposeClient, onChange: () => void, options: StreamManagerOptions<ComposeStreamId> = {}) {
    super(onChange, options);
    this.composeClient = composeClient;
  }

  protected emptyId(): ComposeStreamId { return { project: null, service: null }; }
  protected isSameId(a: ComposeStreamId, b: ComposeStreamId): boolean {
    return a.project === b.project && a.service === b.service;
  }
  protected isValidId(id: ComposeStreamId): boolean { return id.project !== null; }
  protected idLabel(id: ComposeStreamId): string { return id.project ?? '(none)'; }

  protected createStream(id: ComposeStreamId, signal: AbortSignal, attempt: { reconnect: boolean }): AsyncIterable<LogEntry> {
    if (attempt.reconnect) this.cursor.beginResume();
    const since = attempt.reconnect ? this.cursor.sinceIso() : undefined;
    return this.composeClient.streamLogs(id.project!, id.service ?? undefined, since ? MAX_LOG_LINES : 100, signal, since);
  }

  protected acceptItem(entry: LogEntry): boolean {
    return !this.cursor.isReplay(entry);
  }

  protected processItem(_id: ComposeStreamId, entry: LogEntry): void {
    this.cursor.observe(entry);
    this.logs.push(entry);
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
  }

  /** Select by project/service (convenience wrapper). */
  async selectCompose(project: string | null, service: string | null): Promise<void> {
    return this.select({ project, service });
  }

  getLogs(): LogEntry[] {
    return this.logs;
  }
}
