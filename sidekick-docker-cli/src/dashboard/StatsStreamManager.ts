import type { DockerClient } from 'sidekick-docker-shared';
import { StatsCollector, ReconnectScheduler, errorMessage } from 'sidekick-docker-shared';

/**
 * Manages stats streaming for the currently selected container.
 * Only streams stats for one container at a time (expensive operation).
 * Feeds data into StatsCollector for history/charting.
 * Auto-reconnects when a stream ends (e.g. container restart).
 */
export class StatsStreamManager {
  private client: DockerClient;
  private collector: StatsCollector;
  private currentContainerId: string | null = null;
  private aborted = false;
  private streamPromise: Promise<void> | null = null;
  private reconnect = new ReconnectScheduler();
  private onChange: () => void;
  private loadingInterval: ReturnType<typeof setInterval> | null = null;

  constructor(client: DockerClient, collector: StatsCollector, onChange: () => void) {
    this.client = client;
    this.collector = collector;
    this.onChange = onChange;
  }

  /** Switch to streaming stats for a different container. */
  async select(containerId: string | null): Promise<void> {
    if (containerId === this.currentContainerId) return;

    this.stop();

    this.currentContainerId = containerId;
    if (!containerId) return;

    this.aborted = false;
    this.reconnect.reset();

    // Drive rerenders during the loading gap so the spinner animates
    this.loadingInterval = setInterval(() => this.onChange(), 200);

    this.streamPromise = this.streamStats(containerId);
  }

  private clearLoadingInterval(): void {
    if (this.loadingInterval) {
      clearInterval(this.loadingInterval);
      this.loadingInterval = null;
    }
  }

  private async streamStats(containerId: string): Promise<void> {
    try {
      for await (const stats of this.client.streamStats(containerId)) {
        if (this.aborted || this.currentContainerId !== containerId) break;

        this.collector.push(containerId, stats);
        this.clearLoadingInterval();
        this.onChange();
      }
      // Stream ended normally — reset backoff
      this.reconnect.reset();
    } catch (err) {
      console.debug('stats stream error:', errorMessage(err));
    }

    // Auto-reconnect if still selected for this container
    if (!this.aborted && this.currentContainerId === containerId) {
      const scheduled = this.reconnect.schedule(() => {
        if (!this.aborted && this.currentContainerId === containerId) {
          // Re-start loading spinner for the reconnect gap
          this.loadingInterval = setInterval(() => this.onChange(), 200);
          this.streamPromise = this.streamStats(containerId);
        }
      });
      if (!scheduled) {
        console.debug(`stats stream: gave up reconnecting for ${containerId}`);
      }
    }
  }

  stop(): void {
    this.aborted = true;
    this.clearLoadingInterval();
    this.reconnect.clear();
    this.currentContainerId = null;
    this.streamPromise = null;
  }

  getCollector(): StatsCollector {
    return this.collector;
  }

  getCurrentContainerId(): string | null {
    return this.currentContainerId;
  }

  dispose(): void {
    this.stop();
  }
}
