import { detectSeverity } from './LogAnalytics';
import type { SeverityLevel } from './LogAnalytics';

export type LogFormat = 'json' | 'logfmt' | 'plain';

export interface ParsedLogLine {
  format: LogFormat;
  level: SeverityLevel | null;
  message: string;
  timestamp: string | null;
  fields: Record<string, string>;
  raw: string;
}

// JSON log level field names (in priority order)
const LEVEL_KEYS = ['level', 'severity', 'lvl', 'log_level', 'loglevel'];
const MESSAGE_KEYS = ['msg', 'message', 'text', 'body'];
const TIMESTAMP_KEYS = ['time', 'timestamp', 'ts', 'datetime', 'date', '@timestamp', 't'];

function normalizeLevel(value: string): SeverityLevel | null {
  const upper = value.toUpperCase().trim();
  if (['FATAL', 'PANIC', 'ERROR', 'ERR', 'CRITICAL', 'ALERT', 'EMERGENCY', 'EMERG'].includes(upper)) return 'error';
  if (['WARN', 'WARNING'].includes(upper)) return 'warn';
  if (['INFO', 'INFORMATION', 'NOTICE'].includes(upper)) return 'info';
  if (['DEBUG', 'TRACE', 'VERBOSE'].includes(upper)) return 'debug';
  return null;
}

function findField(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    if (key in obj && obj[key] != null) return String(obj[key]);
  }
  return null;
}

function parseJson(line: string): ParsedLogLine | null {
  // Quick check: must start with {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{')) return null;

  try {
    const obj = JSON.parse(trimmed) as Record<string, unknown>;

    const levelValue = findField(obj, LEVEL_KEYS);
    const level = levelValue ? normalizeLevel(levelValue) : null;
    const message = findField(obj, MESSAGE_KEYS) ?? '';
    const timestamp = findField(obj, TIMESTAMP_KEYS);

    // Remaining fields (exclude extracted ones)
    const extracted = new Set([...LEVEL_KEYS, ...MESSAGE_KEYS, ...TIMESTAMP_KEYS]);
    const fields: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (!extracted.has(k) && v != null) {
        fields[k] = typeof v === 'string' ? v : JSON.stringify(v);
      }
    }

    return { format: 'json', level, message, timestamp, fields, raw: line };
  } catch {
    return null;
  }
}

// logfmt: key=value key2="quoted value" key3=unquoted
const LOGFMT_PAIR = /([a-zA-Z_][\w.-]*)=(?:"([^"]*)"|(\S*))/g;

function parseLogfmt(line: string): ParsedLogLine | null {
  // Quick heuristic: must contain at least 2 key=value pairs
  const pairs: [string, string][] = [];
  let match: RegExpExecArray | null;
  LOGFMT_PAIR.lastIndex = 0;
  while ((match = LOGFMT_PAIR.exec(line)) !== null) {
    pairs.push([match[1], match[2] ?? match[3]]);
  }

  if (pairs.length < 2) return null;

  const obj: Record<string, string> = {};
  for (const [k, v] of pairs) obj[k] = v;

  const levelValue = findField(obj, LEVEL_KEYS);
  const level = levelValue ? normalizeLevel(levelValue) : null;
  const message = findField(obj, MESSAGE_KEYS) ?? '';
  const timestamp = findField(obj, TIMESTAMP_KEYS);

  const extracted = new Set([...LEVEL_KEYS, ...MESSAGE_KEYS, ...TIMESTAMP_KEYS]);
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!extracted.has(k)) fields[k] = v;
  }

  return { format: 'logfmt', level, message, timestamp, fields, raw: line };
}

/**
 * Detect the format of a log line and parse structured fields.
 */
export function detectFormat(line: string): LogFormat {
  const trimmed = line.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return 'json';

  LOGFMT_PAIR.lastIndex = 0;
  let pairCount = 0;
  while (LOGFMT_PAIR.exec(trimmed) !== null) {
    pairCount++;
    if (pairCount >= 2) return 'logfmt';
  }

  return 'plain';
}

/**
 * Parse a log line, extracting structured fields if the format is JSON or logfmt.
 * Falls back to plain text with severity detection from the raw message.
 */
export function parseLine(line: string): ParsedLogLine {
  // Try JSON first
  const jsonResult = parseJson(line);
  if (jsonResult) return jsonResult;

  // Try logfmt
  const logfmtResult = parseLogfmt(line);
  if (logfmtResult) return logfmtResult;

  // Plain text fallback
  return {
    format: 'plain',
    level: detectSeverity(line) !== 'other' ? detectSeverity(line) : null,
    message: line,
    timestamp: null,
    fields: {},
    raw: line,
  };
}
