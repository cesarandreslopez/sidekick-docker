import type { LogEntry } from 'sidekick-docker-shared';

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

/** Sparkline with ANSI color (cyan for CPU, green for memory). */
export function coloredSparkline(values: number[], color: 'cpu' | 'memory', width = 40): string {
  const s = sparkline(values, width);
  if (!s) return '';
  return color === 'cpu' ? ansi.brand(s) : ansi.green(s);
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

function detectLogLevel(msg: string): ((s: string) => string) | null {
  const upper = msg.substring(0, 200).toUpperCase();
  if (/\b(FATAL|PANIC)\b/.test(upper)) return ansi.red;
  if (/\b(ERROR|ERR)\b/.test(upper)) return ansi.red;
  if (/\b(WARN|WARNING)\b/.test(upper)) return ansi.yellow;
  if (/\b(INFO)\b/.test(upper)) return ansi.brand;
  if (/\b(DEBUG|TRACE)\b/.test(upper)) return ansi.gray;
  return null;
}

export function colorizeLogEntry(entry: LogEntry): string {
  const ts = entry.timestamp ? entry.timestamp.toISOString().substring(11, 23) : '';
  const tsColored = ts ? ansi.dim(ansi.gray(ts)) + ' ' : '';

  if (entry.stream === 'stderr') {
    return tsColored + ansi.red(entry.message);
  }

  const levelColor = detectLogLevel(entry.message);
  if (levelColor) {
    return tsColored + levelColor(entry.message);
  }

  return tsColored + entry.message;
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
