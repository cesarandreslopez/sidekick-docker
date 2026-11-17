import type { LogEntry, SeverityLevel, FilterMode, SeverityCounts, FilesystemChange, LogTemplate } from 'sidekick-docker-shared';
import { tokenizeLogLine, formatTimestampTime, filterLine } from 'sidekick-docker-shared';
import type { LogTokenType, FilterMatch } from 'sidekick-docker-shared';
import { ACCENT_RGB } from './theme';

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

// --- Color gating ---
// Honors FORCE_COLOR / NO_COLOR / TTY at startup; the CLI `--no-color` flag
// flips it off via setColorEnabled() before any command action runs.

function detectColor(): boolean {
  if (process.env.FORCE_COLOR && process.env.FORCE_COLOR !== '0') return true;
  if (process.env.NO_COLOR) return false;
  return process.stdout.isTTY === true;
}

let colorEnabled = detectColor();

export function setColorEnabled(value: boolean): void {
  if (value !== colorEnabled) {
    colorizedCache = new WeakMap();
    untimedCache = new WeakMap();
  }
  colorEnabled = value;
}

export function isColorEnabled(): boolean {
  return colorEnabled;
}

const style = (open: string, close: string) => (s: string): string =>
  colorEnabled ? `\x1b[${open}m${s}\x1b[${close}m` : s;

// ANSI escape helpers (avoids chalk dependency)
export const ansi = {
  gray: style('90', '39'),
  red: style('31', '39'),
  green: style('32', '39'),
  yellow: style('33', '39'),
  cyan: style('36', '39'),
  accent: style(`38;2;${ACCENT_RGB.join(';')}`, '39'),
  dim: style('2', '22'),
  bold: style('1', '22'),
};

/** Parse Docker status string into compact uptime like "2h 14m" or "5d  3h". */
export function compactUptime(status: string): string {
  // Docker status examples: "Up 2 hours", "Up 5 days", "Up 3 minutes", "Exited (0) 2 hours ago",
  // "Created", "Dead", "Removal In Progress". Only exited containers are "Exited".
  if (/^exited/i.test(status)) return 'Exited';
  if (/^created/i.test(status)) return 'Created';
  if (/^dead/i.test(status)) return 'Dead';
  if (/^remov/i.test(status)) return 'Removing';

  if (/^up\s+less than a second/i.test(status)) return '0s';
  // Extract time components from "Up X (unit)" patterns. Docker words the
  // first minute/hour as "About a minute" / "About an hour".
  const match = status.match(/up\s+(?:about\s+)?(\d+|an?)\s+(second|minute|hour|day|week|month|year)s?/i);
  if (!match) return '';

  const val = /^an?$/i.test(match[1]) ? 1 : parseInt(match[1], 10);
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

/**
 * Shorten `text` to `width` columns with an ellipsis in the middle, keeping
 * the end that tells similar names apart: a replica suffix ("-1"), an image
 * tag (":1.2.3"), or else the last third. Cutting the end instead made
 * "shop-web-1" and "shop-web-2" look identical.
 */
export function truncateMiddle(text: string, width: number): string {
  if (width <= 0) return '';
  if (text.length <= width) return text;
  if (width === 1) return '\u2026';
  const room = width - 1;
  const suffix = /(?:[-_]\d+|:[\w][\w.-]*)$/.exec(text)?.[0] ?? '';
  const tail = suffix && suffix.length <= Math.floor(room / 2) ? suffix.length : Math.floor(room / 3);
  return text.slice(0, room - tail) + '\u2026' + (tail > 0 ? text.slice(-tail) : '');
}

/** One row of the Files tab: A/D/C marker (green/red/yellow) and the path. */
export function formatFileChange(change: FilesystemChange): string {
  const [marker, color] = change.kind === 'added' ? ['A', ansi.green]
    : change.kind === 'deleted' ? ['D', ansi.red]
    : ['C', ansi.yellow];
  return `${color(` ${marker}`)}  ${change.path}`;
}

/** One row of the Patterns tab: right-aligned count, then the template with dimmed wildcards. */
export function formatLogTemplate(t: Pick<LogTemplate, 'count' | 'pattern'>): string {
  // Templates are mined from raw log lines, control characters and all.
  const pattern = stripSgr(sanitizeLogText(t.pattern));
  return `${ansi.yellow(String(t.count).padStart(5))}  ${pattern.replace(/<\*>/g, ansi.gray('<*>'))}`;
}

/** Bold yellow section header for detail panel grouping. */
export function sectionHeader(title: string): string {
  return ansi.bold(ansi.yellow(title));
}

/** Sparkline with ANSI color, min/max labels, and time window. */
export function coloredSparkline(values: number[], color: 'cpu' | 'memory', width = 40): string {
  const s = sparkline(values, width);
  if (!s) return '';
  const colorFn = color === 'cpu' ? ansi.accent : ansi.green;
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
  error: ansi.red,
  warn: ansi.yellow,
  info: ansi.accent,
  debug: ansi.gray,
  other: ansi.gray,
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

const TOKEN_COLORS: Record<LogTokenType, ((s: string) => string) | null> = {
  'severity-error': ansi.red,
  'severity-warn': ansi.yellow,
  'severity-info': ansi.accent,
  'severity-debug': ansi.gray,
  'http-method-safe': ansi.green,
  'http-method-unsafe': ansi.yellow,
  'http-status-2xx': ansi.green,
  'http-status-3xx': ansi.accent,
  'http-status-4xx': ansi.yellow,
  'http-status-5xx': ansi.red,
  'url': ansi.accent,
  'ip-address': ansi.dim,
  'timestamp': (s: string) => ansi.dim(ansi.gray(s)),
  'json-key': ansi.accent,
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

// ── Log text sanitising ──
// Container output is arbitrary bytes. A tab drew as one cell (or shifted
// the row), \r and cursor/erase sequences from progress bars moved Ink's
// cursor and tore the frame, an OSC sequence could retitle the terminal, and
// a BEL beeped on every repaint. Colour (SGR) is the one kind of escape a
// line keeps: Ink draws it, and apps colour their own output.

/** Any escape sequence: CSI, OSC (BEL/ST-terminated), DCS/SOS/PM/APC, or a two-character escape. */
const ESCAPE_SEQUENCE = /\x1b(?:\[[0-?]*[ -/]*[@-~]|\][\s\S]*?(?:\x07|\x1b\\|$)|[PX^_][\s\S]*?(?:\x1b\\|$)|[ -/]*[0-~])?/g;
const IS_SGR = /^\x1b\[[0-9;:]*m$/;
/** Colour/style (SGR) sequences, the only escapes a log line keeps. */
const SGR_SEQUENCE = /\x1b\[[0-9;:]*m/g;
const SGR_SPLIT = /(\x1b\[[0-9;:]*m)/;
const HAS_CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
/** C0 controls except tab (expanded separately), DEL, and C1 controls. */
const CONTROL_CHARS = /[\u0000-\u0008\u000a-\u001f\u007f-\u009f]/g;
const TAB_WIDTH = 8;

/**
 * A log message made safe to draw: tabs expanded to spaces (8-column stops),
 * every other control character and escape sequence removed — except colour
 * (SGR), which is kept.
 */
export function sanitizeLogText(text: string): string {
  if (!HAS_CONTROL.test(text)) return text;
  const kept = text.replace(ESCAPE_SEQUENCE, seq => (IS_SGR.test(seq) ? seq : ''));
  let column = 0;
  return kept.split(SGR_SPLIT).map((part, i) => {
    if (i % 2 === 1) return part; // an SGR sequence: zero width
    let out = '';
    for (const ch of part.replace(CONTROL_CHARS, '')) {
      if (ch === '\t') {
        const pad = TAB_WIDTH - (column % TAB_WIDTH);
        out += ' '.repeat(pad);
        column += pad;
      } else {
        out += ch;
        column++;
      }
    }
    return out;
  }).join('');
}

/** `text` without colour (SGR) sequences. */
export function stripSgr(text: string): string {
  return text.replace(SGR_SEQUENCE, '');
}

const plainTextCache = new WeakMap<LogEntry, string>();

/** A log entry's message as plain text: what the log filter matches and Copy Logs copies. */
export function logPlainText(entry: LogEntry): string {
  const cached = plainTextCache.get(entry);
  if (cached !== undefined) return cached;
  const plain = stripSgr(sanitizeLogText(entry.message));
  plainTextCache.set(entry, plain);
  return plain;
}

/**
 * Marks a stderr line. The whole line used to be red, which hid its own
 * highlighting and, with colour off, left nothing to tell it apart.
 */
export const STDERR_GUTTER = '┃ ';

let colorizedCache = new WeakMap<LogEntry, string>();
/** The same lines without their timestamp (narrow compare columns); a cache of its own. */
let untimedCache = new WeakMap<LogEntry, string>();

export interface LogLineOptions {
  /** Prefix each line with its local time (default). Narrow compare columns drop it. */
  timestamps?: boolean;
}

export function colorizeLogEntry(entry: LogEntry, filterMatches?: FilterMatch[], opts: LogLineOptions = {}): string {
  const timestamps = opts.timestamps !== false;
  const cache = timestamps ? colorizedCache : untimedCache;
  // Cache unfiltered output (filtered highlighting varies per query)
  if (!filterMatches) {
    const cached = cache.get(entry);
    if (cached !== undefined) return cached;
  }

  const ts = timestamps && entry.timestamp ? formatTimestampTime(entry.timestamp) : '';
  const tsColored = ts ? ansi.dim(ansi.gray(ts)) + ' ' : '';
  const gutter = entry.stream === 'stderr' ? ansi.dim(ansi.red(STDERR_GUTTER)) : '';

  let msg: string;
  if (filterMatches && filterMatches.length > 0) {
    // Match offsets index the plain text, which is what gets highlighted.
    msg = highlightMatches(logPlainText(entry), filterMatches);
  } else {
    const sanitized = sanitizeLogText(entry.message);
    // A line the app coloured itself keeps its colours (unless colour is
    // off); token colours would only fight them.
    msg = sanitized.includes('\x1b[')
      ? (colorEnabled ? sanitized : stripSgr(sanitized))
      : colorizeTokens(sanitized);
  }
  const result = tsColored + gutter + msg;

  if (!filterMatches) {
    cache.set(entry, result);
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
    const matched = text.slice(m.start, m.start + m.length);
    parts.push(colorEnabled ? `\x1b[44;37m${matched}\x1b[49;39m` : matched);
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
  return ansi.accent(line.substring(0, eqIdx)) + '=' + line.substring(eqIdx + 1);
}

export function colorizeDetailKey(line: string): string {
  const match = line.match(/^(\s*\S+:\s*)/);
  if (!match) return line;
  return ansi.accent(match[1]) + line.substring(match[1].length);
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
  opts: LogLineOptions = {},
): string[] {
  const lines: string[] = [];

  // Severity counts header
  if (severityCounts && severityCounts.total > 0) {
    const parts: string[] = [];
    if (severityCounts.error > 0) parts.push(ansi.red(`E:${severityCounts.error}`));
    if (severityCounts.warn > 0) parts.push(ansi.yellow(`W:${severityCounts.warn}`));
    if (severityCounts.info > 0) parts.push(ansi.accent(`I:${severityCounts.info}`));
    if (severityCounts.debug > 0) parts.push(ansi.gray(`D:${severityCounts.debug}`));
    if (parts.length > 0) lines.push(parts.join('  '));
  }

  if (filterString) {
    let matchCount = 0;
    for (const l of logs) {
      const result = filterLine(logPlainText(l), filterString, filterMode);
      if (result.matched) {
        matchCount++;
        lines.push(colorizeLogEntry(l, result.matches, opts));
      }
    }
    if (lines.length <= (severityCounts ? 1 : 0)) {
      lines.push(ansi.gray(`No logs matching "${filterString}"`));
    } else {
      const headerIdx = severityCounts ? 1 : 0;
      // Tab only toggles the mode inside the filter prompt, so say f.
      lines.splice(headerIdx, 0, ansi.gray(`${matchCount} matches (${filterMode}) — f to edit the filter`));
    }
  } else {
    for (const l of logs) {
      lines.push(colorizeLogEntry(l, undefined, opts));
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
