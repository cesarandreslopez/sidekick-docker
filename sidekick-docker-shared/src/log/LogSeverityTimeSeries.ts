import type { SeverityLevel } from './LogAnalytics';

export interface SeverityBucket {
  /** Bucket start timestamp (ms) */
  timestamp: number;
  error: number;
  warn: number;
  info: number;
  debug: number;
  other: number;
}

const DEFAULT_BUCKET_COUNT = 60;
const BUCKET_DURATION_MS = 60_000; // 1 minute

/**
 * Rolling time-series of log severity counts.
 * Maintains a ring buffer of 1-minute buckets (default 60 = 1 hour window).
 */
export class LogSeverityTimeSeries {
  private buckets: SeverityBucket[] = [];
  private maxBuckets: number;
  private bucketDuration: number;

  constructor(maxBuckets = DEFAULT_BUCKET_COUNT, bucketDuration = BUCKET_DURATION_MS) {
    this.maxBuckets = maxBuckets;
    this.bucketDuration = bucketDuration;
  }

  /**
   * Record a severity event at the current time.
   */
  push(severity: SeverityLevel, now = Date.now()): void {
    const bucketTs = Math.floor(now / this.bucketDuration) * this.bucketDuration;

    // Get or create current bucket
    let bucket = this.buckets.length > 0 ? this.buckets[this.buckets.length - 1] : null;

    if (!bucket || bucket.timestamp !== bucketTs) {
      bucket = { timestamp: bucketTs, error: 0, warn: 0, info: 0, debug: 0, other: 0 };
      this.buckets.push(bucket);
      if (this.buckets.length > this.maxBuckets) {
        this.buckets.shift();
      }
    }

    bucket[severity]++;
  }

  /**
   * Get all buckets in chronological order.
   */
  getBuckets(): SeverityBucket[] {
    return [...this.buckets];
  }

  /**
   * Get the dominant severity for each bucket (for coloring sparklines).
   */
  getDominantSeries(): { severity: SeverityLevel; total: number }[] {
    return this.buckets.map(b => {
      const counts: [SeverityLevel, number][] = [
        ['error', b.error],
        ['warn', b.warn],
        ['info', b.info],
        ['debug', b.debug],
        ['other', b.other],
      ];
      const total = counts.reduce((sum, [, c]) => sum + c, 0);
      // Dominant: errors take priority, then warn, etc.
      const dominant = counts.reduce((best, curr) => curr[1] > best[1] ? curr : best);
      return { severity: dominant[0], total };
    });
  }

  /**
   * Get total counts per bucket (for sparkline height).
   */
  getTotalSeries(): number[] {
    return this.buckets.map(b => b.error + b.warn + b.info + b.debug + b.other);
  }

  reset(): void {
    this.buckets = [];
  }
}
