// Types
export * from './types';

// Docker client
export { DockerClient } from './docker/DockerClient';
export type { DockerClientOptions, LogStreamOptions } from './docker/DockerClient';

// Compose
export { ComposeDetector } from './compose/ComposeDetector';
export { ComposeClient } from './compose/ComposeClient';
export type { ComposeExecResult } from './compose/ComposeClient';
export { ComposeFileReader } from './compose/ComposeFileReader';
export type { ComposeFileConfig, ComposeFileServiceConfig } from './compose/ComposeFileReader';

// Stats
export { StatsCollector } from './stats/StatsCollector';

// Log analysis
export { tokenizeLogLine } from './log/LogTokenizer';
export type { LogToken, LogTokenType } from './log/LogTokenizer';
export { exactMatch, fuzzyMatch, filterLine } from './log/LogFilter';
export type { FilterMatch, FilterResult, FilterMode } from './log/LogFilter';
export { LogAnalytics, detectSeverity } from './log/LogAnalytics';
export type { SeverityLevel, SeverityCounts } from './log/LogAnalytics';
export { detectFormat, parseLine } from './log/LogParser';
export type { LogFormat, ParsedLogLine } from './log/LogParser';
export { LogSeverityTimeSeries } from './log/LogSeverityTimeSeries';
export type { SeverityBucket } from './log/LogSeverityTimeSeries';
export { LogTemplateEngine } from './log/LogTemplateEngine';
export type { LogTemplate, TemplateDiagnostics } from './log/LogTemplateEngine';

// Events
export { EventWatcher } from './events/EventWatcher';
export type { EventWatcherCallbacks } from './events/EventWatcher';

// Formatters
export {
  formatBytes,
  formatCpu,
  formatMemory,
  formatPorts,
  stateIcon,
  truncate,
  stateColor,
  CONTAINER_ID_LENGTH,
  shortId,
  formatTimestampTime,
} from './formatters';

// Reconnect
export { ReconnectScheduler, INITIAL_RECONNECT_DELAY, MAX_RECONNECT_DELAY, MAX_RECONNECT_ATTEMPTS } from './events/reconnect';

// Errors
export { errorMessage } from './errors';

// Constants
export const MAX_LOG_LINES = 1000;

// Branding & phrases
export { BRAND_INLINE, BRAND_TAGLINE, BRAND_COLOR_HEX, BRAND_COLOR_ANSI, BRAND_COLOR_ANSI_RESET } from './branding';
export { getRandomPhrase } from './phrases';
