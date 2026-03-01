export type LogTokenType =
  | 'severity-error'
  | 'severity-warn'
  | 'severity-info'
  | 'severity-debug'
  | 'http-method-safe'
  | 'http-method-unsafe'
  | 'http-status-2xx'
  | 'http-status-3xx'
  | 'http-status-4xx'
  | 'http-status-5xx'
  | 'url'
  | 'ip-address'
  | 'timestamp'
  | 'json-key'
  | 'state-ok'
  | 'state-fail'
  | 'path'
  | 'number'
  | 'plain';

export interface LogToken {
  text: string;
  type: LogTokenType;
}

// Single combined regex with named groups for single-pass matching.
// Order matters: more specific patterns first.
const TOKEN_PATTERN = new RegExp(
  [
    // HTTP status codes (3-digit, standalone)
    '(?<status>\\b[2345]\\d{2}\\b)',
    // HTTP methods
    '(?<method>\\b(?:GET|HEAD|OPTIONS|TRACE|PUT|POST|PATCH|DELETE)\\b)',
    // Severity keywords
    '(?<severity>\\b(?:FATAL|PANIC|ERROR|ERR|WARN|WARNING|INFO|DEBUG|TRACE)\\b)',
    // URLs (http/https)
    '(?<url>https?://[^\\s"\'\\]}>)]+)',
    // IP addresses (v4)
    '(?<ip>\\b\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}(?::\\d+)?\\b)',
    // ISO timestamps or common log timestamps
    '(?<timestamp>\\d{4}-\\d{2}-\\d{2}[T ]\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:?\\d{2})?)',
    // JSON keys: "key":
    '(?<jsonkey>"[^"]{1,40}"(?=\\s*:))',
    // State keywords
    '(?<stateok>\\b(?:success|succeeded|healthy|active|enabled|connected|ready|complete|completed|started|up|online|resolved|passed|ok|done|alive)\\b)',
    '(?<statefail>\\b(?:fail|failed|failure|unhealthy|inactive|disabled|disconnected|timeout|refused|rejected|crashed|killed|stopped|unreachable|blocked|denied|broken)\\b)',
    // Unix-style paths
    '(?<path>(?:^|\\s)/[\\w./-]{2,})',
  ].join('|'),
  'gi',
);

function classifyStatus(code: string): LogTokenType {
  const n = parseInt(code, 10);
  if (n >= 200 && n < 300) return 'http-status-2xx';
  if (n >= 300 && n < 400) return 'http-status-3xx';
  if (n >= 400 && n < 500) return 'http-status-4xx';
  return 'http-status-5xx';
}

function classifySeverity(word: string): LogTokenType {
  const u = word.toUpperCase();
  if (u === 'FATAL' || u === 'PANIC' || u === 'ERROR' || u === 'ERR') return 'severity-error';
  if (u === 'WARN' || u === 'WARNING') return 'severity-warn';
  if (u === 'INFO') return 'severity-info';
  return 'severity-debug'; // DEBUG, TRACE
}

function classifyMethod(method: string): LogTokenType {
  const u = method.toUpperCase();
  if (u === 'GET' || u === 'HEAD' || u === 'OPTIONS' || u === 'TRACE') return 'http-method-safe';
  return 'http-method-unsafe';
}

/**
 * Tokenize a log line into typed segments for syntax highlighting.
 * Uses a single-pass regex to identify tokens; gaps between matches become 'plain' tokens.
 */
export function tokenizeLogLine(line: string): LogToken[] {
  if (!line) return [{ text: '', type: 'plain' }];

  const tokens: LogToken[] = [];
  let lastIndex = 0;

  // Reset lastIndex for global regex
  TOKEN_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = TOKEN_PATTERN.exec(line)) !== null) {
    // Add plain text before this match
    if (match.index > lastIndex) {
      tokens.push({ text: line.slice(lastIndex, match.index), type: 'plain' });
    }

    const groups = match.groups!;
    let type: LogTokenType = 'plain';

    if (groups.status !== undefined) type = classifyStatus(groups.status);
    else if (groups.method !== undefined) type = classifyMethod(groups.method);
    else if (groups.severity !== undefined) type = classifySeverity(groups.severity);
    else if (groups.url !== undefined) type = 'url';
    else if (groups.ip !== undefined) type = 'ip-address';
    else if (groups.timestamp !== undefined) type = 'timestamp';
    else if (groups.jsonkey !== undefined) type = 'json-key';
    else if (groups.stateok !== undefined) type = 'state-ok';
    else if (groups.statefail !== undefined) type = 'state-fail';
    else if (groups.path !== undefined) type = 'path';

    tokens.push({ text: match[0], type });
    lastIndex = match.index + match[0].length;
  }

  // Trailing plain text
  if (lastIndex < line.length) {
    tokens.push({ text: line.slice(lastIndex), type: 'plain' });
  }

  return tokens;
}
