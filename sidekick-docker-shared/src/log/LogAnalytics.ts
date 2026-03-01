export type SeverityLevel = 'error' | 'warn' | 'info' | 'debug' | 'other';

export interface SeverityCounts {
  error: number;
  warn: number;
  info: number;
  debug: number;
  other: number;
  total: number;
}

const SEVERITY_PATTERN = /\b(FATAL|PANIC|ERROR|ERR|WARN|WARNING|INFO|DEBUG|TRACE)\b/i;

/**
 * Detect severity level from a log message string.
 */
export function detectSeverity(message: string): SeverityLevel {
  const match = message.substring(0, 200).match(SEVERITY_PATTERN);
  if (!match) return 'other';

  const keyword = match[1].toUpperCase();
  if (keyword === 'FATAL' || keyword === 'PANIC' || keyword === 'ERROR' || keyword === 'ERR') return 'error';
  if (keyword === 'WARN' || keyword === 'WARNING') return 'warn';
  if (keyword === 'INFO') return 'info';
  return 'debug'; // DEBUG, TRACE
}

/**
 * Tracks running severity counts for a log stream.
 */
export class LogAnalytics {
  private counts: SeverityCounts = { error: 0, warn: 0, info: 0, debug: 0, other: 0, total: 0 };

  /**
   * Classify a log message and update counts.
   */
  push(message: string): SeverityLevel {
    const severity = detectSeverity(message);
    this.counts[severity]++;
    this.counts.total++;
    return severity;
  }

  getCounts(): SeverityCounts {
    return { ...this.counts };
  }

  reset(): void {
    this.counts = { error: 0, warn: 0, info: 0, debug: 0, other: 0, total: 0 };
  }
}
