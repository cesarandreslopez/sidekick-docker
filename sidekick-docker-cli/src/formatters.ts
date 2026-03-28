import type { LogEntry, SeverityLevel, FilterMode, SeverityCounts } from 'sidekick-docker-shared';
import { tokenizeLogLine, formatTimestampTime, filterLine } from 'sidekick-docker-shared';
import type { LogTokenType, FilterMatch } from 'sidekick-docker-shared';

// Re-export pure formatters from shared package
export {
  formatBytes,
  formatCpu,
  formatMemory,
  formatPorts,
  stateIcon,
  truncate,
  stateColor,
} from 'sidekick-docker-shared';

export function formatUptime(status: string): string {
  return status;
}

/** Parse Docker status string into compact uptime like "2h 14m" or "5d  3h". */
export function compactUptime(status: string): string {
  // Docker status examples: "Up 2 hours", "Up 5 days", "Up 3 minutes", "Exited (0) 2 hours ago"
  if (/^exited|^dead|^created|^removing/i.test(status)) return 'Exited';

  // Extract time components from "Up X (unit)" patterns
  const match = status.match(/up\s+(?:about\s+)?(\d+)\s+(second|minute|hour|day|week|month|year)s?/i);
  if (!match) return '';

  const val = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case 'second': return `${val}s`;
    case 'minute': return `${val}m`;
    case 'hour': return val < 24 ? `${val}h` : `${Math.floor(val / 24)}d ${val % 24}h`;
    case 'day': return val < 7 ? `${val}d` : `${Math.floor(val / 7)}w ${val % 7}d`;
    case 'week': return `${val}w`;
    case 'month': return `${val}mo`;
    case 'year': return `${val}y`;
    default: return '';
  }
}

/** Bold yellow section header for detail panel grouping. */
export function sectionHeader(title: string): string {
  return ansi.bold(ansi.yellow(title));
}

/** Sparkline with ANSI color, min/max labels, and time window. */
export function coloredSparkline(values: number[], color: 'cpu' | 'memory', width = 40): string {
  const s = sparkline(values, width);
  if (!s) return '';
  const colorFn = color === 'cpu' ? ansi.brand : ansi.green;
  const recent = values.slice(-width);
  const min = Math.min(...recent);
  const max = Math.max(...recent, 1);
  const minLabel = ansi.dim(ansi.gray(formatSparkValue(min)));
  const maxLabel = ansi.dim(ansi.gray(formatSparkValue(max)));
  const timeLabel = ansi.dim(ansi.gray(`\u2190${recent.length}s`));
  return `${minLabel}${colorFn(s)}${maxLabel} ${timeLabel}`;
}

function formatSparkValue(v: number): string {
  if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
  if (v >= 100) return `${Math.round(v)}`;
  return v.toFixed(1);
}

export function sparkline(values: number[], width = 40): string {
  if (values.length === 0) return '';
  const max = Math.max(...values, 1);
  const bars = '\u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588';
  const recent = values.slice(-width);
  return recent.map(v => {
    const idx = Math.min(Math.floor((v / max) * (bars.length - 1)), bars.length - 1);
    return bars[idx];
  }).join('');
}

const SEVERITY_COLORS: Record<SeverityLevel, (s: string) => string> = {
  error: (s: string) => `\x1b[31m${s}\x1b[39m`,
  warn: (s: string) => `\x1b[33m${s}\x1b[39m`,
  info: (s: string) => `\x1b[38;2;43;76;126m${s}\x1b[39m`,
  debug: (s: string) => `\x1b[90m${s}\x1b[39m`,
  other: (s: string) => `\x1b[90m${s}\x1b[39m`,
};

/** Severity-colored sparkline: each position colored by dominant severity in that time bucket. */
export function severitySparkline(series: { severity: SeverityLevel; total: number }[], width = 40): string {
  if (series.length === 0) return '';
  const recent = series.slice(-width);
  const max = Math.max(...recent.map(s => s.total), 1);
  const bars = '\u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588';
  return recent.map(s => {
    const idx = Math.min(Math.floor((s.total / max) * (bars.length - 1)), bars.length - 1);
    return SEVERITY_COLORS[s.severity](bars[idx]);
  }).join('');
}

// ANSI escape helpers (avoids chalk dependency)
const ansi = {
  gray: (s: string) => `\x1b[90m${s}\x1b[39m`,
  red: (s: string) => `\x1b[31m${s}\x1b[39m`,
  green: (s: string) => `\x1b[32m${s}\x1b[39m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[39m`,
  brand: (s: string) => `\x1b[38;2;43;76;126m${s}\x1b[39m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[22m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[22m`,
};

const TOKEN_COLORS: Record<LogTokenType, ((s: string) => string) | null> = {
  'severity-error': ansi.red,
  'severity-warn': ansi.yellow,
  'severity-info': ansi.brand,
  'severity-debug': ansi.gray,
  'http-method-safe': ansi.green,
  'http-method-unsafe': ansi.yellow,
  'http-status-2xx': ansi.green,
  'http-status-3xx': ansi.brand,
  'http-status-4xx': ansi.yellow,
  'http-status-5xx': ansi.red,
  'url': ansi.brand,
  'ip-address': ansi.dim,
  'timestamp': (s: string) => ansi.dim(ansi.gray(s)),
  'json-key': ansi.brand,
  'state-ok': ansi.green,
  'state-fail': ansi.red,
  'path': ansi.dim,
  'number': null,
  'plain': null,
};

function colorizeTokens(message: string): string {
  const tokens = tokenizeLogLine(message);
  return tokens.map(t => {
    const colorFn = TOKEN_COLORS[t.type];
    return colorFn ? colorFn(t.text) : t.text;
  }).join('');
}

const colorizedCache = new WeakMap<LogEntry, string>();

export function colorizeLogEntry(entry: LogEntry, filterMatches?: FilterMatch[]): string {
  // Cache unfiltered output (filtered highlighting varies per query)
  if (!filterMatches) {
    const cached = colorizedCache.get(entry);
    if (cached !== undefined) return cached;
  }

  const ts = entry.timestamp ? formatTimestampTime(entry.timestamp) : '';
  const tsColored = ts ? ansi.dim(ansi.gray(ts)) + ' ' : '';

  let result: string;
  if (entry.stream === 'stderr') {
    const msg = filterMatches
      ? highlightMatches(entry.message, filterMatches, ansi.red)
      : ansi.red(entry.message);
    result = tsColored + msg;
  } else if (filterMatches && filterMatches.length > 0) {
    result = tsColored + highlightMatches(entry.message, filterMatches);
  } else {
    result = tsColored + colorizeTokens(entry.message);
  }

  if (!filterMatches) {
    colorizedCache.set(entry, result);
  }
  return result;
}

/** Apply ANSI highlight background to matched regions within a string. */
function highlightMatches(text: string, matches: FilterMatch[], baseFn?: (s: string) => string): string {
  if (matches.length === 0) return baseFn ? baseFn(text) : colorizeTokens(text);

  // Sort matches by start position
  const sorted = [...matches].sort((a, b) => a.start - b.start);
  const parts: string[] = [];
  let pos = 0;

  for (const m of sorted) {
    if (m.start > pos) {
      const segment = text.slice(pos, m.start);
      parts.push(baseFn ? baseFn(segment) : segment);
    }
    // Blue background highlight for matches
    parts.push(`\x1b[44;37m${text.slice(m.start, m.start + m.length)}\x1b[49;39m`);
    pos = m.start + m.length;
  }

  if (pos < text.length) {
    const segment = text.slice(pos);
    parts.push(baseFn ? baseFn(segment) : segment);
  }

  return parts.join('');
}

// Detail panel colorize helpers

export function colorizeEnvLine(line: string): string {
  const eqIdx = line.indexOf('=');
  if (eqIdx === -1) return line;
  return ansi.brand(line.substring(0, eqIdx)) + '=' + line.substring(eqIdx + 1);
}

export function colorizeDetailKey(line: string): string {
  const match = line.match(/^(\s*\S+:\s*)/);
  if (!match) return line;
  return ansi.brand(match[1]) + line.substring(match[1].length);
}

export function colorizeHealth(status: 'healthy' | 'unhealthy' | 'starting'): string {
  switch (status) {
    case 'healthy': return ansi.green(status);
    case 'unhealthy': return ansi.red(status);
    case 'starting': return ansi.yellow(status);
  }
}

export function colorizeState(state: string): string {
  switch (state) {
    case 'running': return ansi.green(state);
    case 'exited': case 'dead': case 'stopped': return ansi.red(state);
    case 'paused': case 'partial': case 'restarting': case 'removing': return ansi.yellow(state);
    default: return state;
  }
}

export function colorizeBool(value: boolean): string {
  return value ? ansi.green('Yes') : ansi.dim(ansi.gray('No'));
}

export function colorizeId(id: string): string {
  return ansi.dim(ansi.gray(id));
}

export function colorizePercent(value: number): string {
  const str = value.toFixed(1) + '%';
  if (value > 80) return ansi.red(str);
  if (value > 50) return ansi.yellow(str);
  return str;
}

export function colorizeNetworkContainer(name: string, id: string): string {
  return `${name} (${ansi.dim(ansi.gray(id))})`;
}

export function stripCursorEscapes(text: string): string {
  return text
    .replace(/\x1b\[\d*[ABCD]/g, '')
    .replace(/\x1b\[\d*(?:;\d*)?[Hf]/g, '')
    .replace(/\x1b\[\d*[JK]/g, '')
    .replace(/\x1b\[\?\d+[hl]/g, '')
    .replace(/\x1b\[[su]/g, '')
    .replace(/\x1b[78]/g, '')
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\r/g, '');
}

/**
 * Render log entries into an array of colorized lines, applying an optional filter.
 * Shared by primary and secondary log rendering.
 */
export function renderLogLines(
  logs: LogEntry[],
  filterString: string,
  filterMode: FilterMode,
  severityCounts?: SeverityCounts | null,
): string[] {
  const lines: string[] = [];

  // Severity counts header
  if (severityCounts && severityCounts.total > 0) {
    const parts: string[] = [];
    if (severityCounts.error > 0) parts.push(`\x1b[31mE:${severityCounts.error}\x1b[39m`);
    if (severityCounts.warn > 0) parts.push(`\x1b[33mW:${severityCounts.warn}\x1b[39m`);
    if (severityCounts.info > 0) parts.push(`\x1b[38;2;43;76;126mI:${severityCounts.info}\x1b[39m`);
    if (severityCounts.debug > 0) parts.push(`\x1b[90mD:${severityCounts.debug}\x1b[39m`);
    if (parts.length > 0) lines.push(parts.join('  '));
  }

  if (filterString) {
    let matchCount = 0;
    for (const l of logs) {
      const result = filterLine(l.message, filterString, filterMode);
      if (result.matched) {
        matchCount++;
        lines.push(colorizeLogEntry(l, result.matches));
      }
    }
    if (lines.length <= (severityCounts ? 1 : 0)) {
      lines.push(`\x1b[90mNo logs matching "${filterString}"\x1b[39m`);
    } else {
      const headerIdx = severityCounts ? 1 : 0;
      lines.splice(headerIdx, 0, `\x1b[90m${matchCount} matches (f to filter, Tab to toggle mode)\x1b[39m`);
    }
  } else {
    for (const l of logs) {
      lines.push(colorizeLogEntry(l));
    }
  }

  return lines;
}

/**
 * Clip an ANSI-colored string to a maximum visible width.
 * Preserves escape sequences, truncates at visible character boundary, pads if shorter.
 */
export function clipAnsi(str: string, maxWidth: number): string {
  let visible = 0;
  let i = 0;
  let result = '';

  while (i < str.length && visible < maxWidth) {
    if (str[i] === '\x1b') {
      // Consume entire ANSI escape sequence
      const start = i;
      i++; // skip ESC
      if (i < str.length && str[i] === '[') {
        i++;
        while (i < str.length && str[i] !== 'm' && !/[A-Za-z]/.test(str[i])) i++;
        if (i < str.length) i++; // skip terminator
      }
      result += str.slice(start, i);
    } else {
      result += str[i];
      visible++;
      i++;
    }
  }

  // Reset any open ANSI sequences and pad
  if (visible < maxWidth) {
    result += ' '.repeat(maxWidth - visible);
  }
  result += '\x1b[0m';

  return result;
}
