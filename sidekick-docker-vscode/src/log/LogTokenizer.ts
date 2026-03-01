// Browser-compatible copy of sidekick-docker-shared/src/log/LogTokenizer.ts
// Duplicated to avoid Node.js deps in the webview (IIFE) bundle.

import type { LogToken, LogTokenType } from '../types/log';

const TOKEN_PATTERN = new RegExp(
  [
    '(?<status>\\b[2345]\\d{2}\\b)',
    '(?<method>\\b(?:GET|HEAD|OPTIONS|TRACE|PUT|POST|PATCH|DELETE)\\b)',
    '(?<severity>\\b(?:FATAL|PANIC|ERROR|ERR|WARN|WARNING|INFO|DEBUG|TRACE)\\b)',
    '(?<url>https?://[^\\s"\'\\]}>)]+)',
    '(?<ip>\\b\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}(?::\\d+)?\\b)',
    '(?<timestamp>\\d{4}-\\d{2}-\\d{2}[T ]\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:?\\d{2})?)',
    '(?<jsonkey>"[^"]{1,40}"(?=\\s*:))',
    '(?<stateok>\\b(?:success|succeeded|healthy|active|enabled|connected|ready|complete|completed|started|up|online|resolved|passed|ok|done|alive)\\b)',
    '(?<statefail>\\b(?:fail|failed|failure|unhealthy|inactive|disabled|disconnected|timeout|refused|rejected|crashed|killed|stopped|unreachable|blocked|denied|broken)\\b)',
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
  return 'severity-debug';
}

function classifyMethod(method: string): LogTokenType {
  const u = method.toUpperCase();
  if (u === 'GET' || u === 'HEAD' || u === 'OPTIONS' || u === 'TRACE') return 'http-method-safe';
  return 'http-method-unsafe';
}

export function tokenizeLogLine(line: string): LogToken[] {
  if (!line) return [{ text: '', type: 'plain' }];

  const tokens: LogToken[] = [];
  let lastIndex = 0;
  TOKEN_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = TOKEN_PATTERN.exec(line)) !== null) {
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

  if (lastIndex < line.length) {
    tokens.push({ text: line.slice(lastIndex), type: 'plain' });
  }

  return tokens;
}
