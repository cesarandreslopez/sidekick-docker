// Browser-compatible copy of sidekick-docker-shared/src/log/LogAnalytics.ts
import type { SeverityLevel, SeverityCounts } from '../types/log';

const SEVERITY_PATTERN = /\b(FATAL|PANIC|ERROR|ERR|WARN|WARNING|INFO|DEBUG|TRACE)\b/i;

export function detectSeverity(message: string): SeverityLevel {
  const match = message.substring(0, 200).match(SEVERITY_PATTERN);
  if (!match) return 'other';
  const keyword = match[1].toUpperCase();
  if (keyword === 'FATAL' || keyword === 'PANIC' || keyword === 'ERROR' || keyword === 'ERR') return 'error';
  if (keyword === 'WARN' || keyword === 'WARNING') return 'warn';
  if (keyword === 'INFO') return 'info';
  return 'debug';
}

export class LogAnalytics {
  private counts: SeverityCounts = { error: 0, warn: 0, info: 0, debug: 0, other: 0, total: 0 };

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
