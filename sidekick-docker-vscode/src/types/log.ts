// Log types re-exported for webview (browser) bundle.
// These mirror the types in sidekick-docker-shared/src/log/ but are duplicated
// to avoid pulling Node.js dependencies into the browser bundle.

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

export interface FilterMatch {
  start: number;
  length: number;
}

export interface FilterResult {
  matched: boolean;
  matches: FilterMatch[];
}

export type FilterMode = 'exact' | 'fuzzy';

export type SeverityLevel = 'error' | 'warn' | 'info' | 'debug' | 'other';

export interface SeverityCounts {
  error: number;
  warn: number;
  info: number;
  debug: number;
  other: number;
  total: number;
}
