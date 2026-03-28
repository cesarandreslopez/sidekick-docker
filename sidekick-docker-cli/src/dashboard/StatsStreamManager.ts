import type { DockerClient, ContainerStats } from 'sidekick-docker-shared';
import { StatsCollector } from 'sidekick-docker-shared';
import { BaseStreamManager } from './BaseStreamManager';

/**
 * Manages stats streaming for the currently selected container.
 * Only streams stats for one container at a time (expensive operation).
 * Feeds data into StatsCollector for history/charting.
 * Auto-reconnects when a stream ends (e.g. container restart).
 */
export class StatsStreamManager extends BaseStreamManager<string | null, ContainerStats> {
  private client: DockerClient;
  private collector: StatsCollector;

  protected readonly streamLabel = 'stats';

  constructor(client: DockerClient, collector: StatsCollector, onChange: () => void) {
    super(onChange);
    this.client = client;
    this.collector = collector;
  }

  protected emptyId(): string | null { return null; }
  protected isSameId(a: string | null, b: string | null): boolean { return a === b; }
  protected isValidId(id: string | null): boolean { return id !== null; }
  protected idLabel(id: string | null): string { return id ?? '(none)'; }

  protected createStream(id: string | null, signal: AbortSignal): AsyncIterable<ContainerStats> {
    return this.client.streamStats(id!, signal);
  }

  protected processItem(id: string | null, stats: ContainerStats): void {
    this.collector.push(id!, stats);
  }

  protected onClear(): void {
    // StatsCollector is managed externally
  }

  protected onBeforeStream(): void {
    // Trigger a single rerender so the UI can show a static loading state.
    this.onChange();
  }

  getCollector(): StatsCollector {
    return this.collector;
  }

  getCurrentContainerId(): string | null {
    return this.currentId;
  }
}
