// Types
export * from './types';

// Docker client
export { DockerClient, DockerTimeoutError } from './docker/DockerClient';
export type { DockerClientOptions, LogStreamOptions, PingResult, ListResourcesOptions, ResourceListing } from './docker/DockerClient';
export { parseDockerEndpoint, describeDockerEndpoint, dockerCliEnv } from './docker/endpoint';

// Compose
export { ComposeDetector } from './compose/ComposeDetector';
export type { ComposeProjectSource } from './compose/ComposeDetector';
export { ComposeClient, ComposeError, composeFailureReason, throwIfComposeFailed } from './compose/ComposeClient';
export type { ComposeExecResult, ComposeClientOptions } from './compose/ComposeClient';
export { runProcess, TIMEOUT_EXIT_CODE } from './compose/process';
export type { RunProcessOptions } from './compose/process';
export { resolveComposeCwd, resolveComposeOptions } from './compose/composeCwd';
export type { ComposeProjectSourceLocation, ComposeCommandOptions } from './compose/composeCwd';
export { ComposeFileReader } from './compose/ComposeFileReader';
export { CachedComposeFileReader, composeFileSignature } from './compose/ComposeConfigCache';
export type { ComposeConfigSource, CachedComposeFileReaderOptions } from './compose/ComposeConfigCache';
export type { ComposeFileConfig, ComposeFileServiceConfig, ComposeFileReaderOptions, ComposeReadResult } from './compose/ComposeFileReader';

// Stats
export { StatsCollector } from './stats/StatsCollector';
export { StatsSampler, STATS_SAMPLE_INTERVAL_MS } from './stats/StatsSampler';
export type { StatsSamplerOptions } from './stats/StatsSampler';

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
export { FollowStream } from './events/FollowStream';
export type { FollowStreamState, FollowStreamOptions } from './events/FollowStream';
export { LogResumeCursor } from './events/LogResumeCursor';

// State
export { DockerStateStore } from './state/DockerStateStore';
export type { DockerStateSnapshot, DockerStateStoreOptions, StoreChange } from './state/DockerStateStore';
export { classifyEvent, applyEffect, splitEventAction } from './state/eventPolicy';
export type { EventEffect, ResourceKind } from './state/eventPolicy';

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
  canStart,
  canStop,
  matchesRunningOnly,
  pruneCandidateCount,
  pruneConfirmMessage,
  pruneConfirmFor,
  pruneResultText,
  imageDisplayName,
  removeImageConfirmMessage,
  composeDownConfirmMessage,
  removeVolumeConfirmMessage,
  removeNetworkConfirmMessage,
  removeContainerConfirmMessage,
  sortDirectionLabel,
  publishedPortUrls,
  browserHostForEndpoint,
  actionText,
  actionFailedText,
  summarizeRestartPolicy,
  formatMount,
  summarizeHealth,
} from './formatters';
export type { PruneKind, ContainerSortField, ActionType } from './formatters';

// Reconnect
export { ReconnectScheduler, INITIAL_RECONNECT_DELAY, MAX_RECONNECT_DELAY, MAX_RECONNECT_ATTEMPTS } from './events/reconnect';

// Errors
export { errorMessage, errorCode, explainDockerUnreachable } from './errors';

// Constants
export const MAX_LOG_LINES = 1000;

// Branding & phrases
export { BRAND_INLINE, BRAND_TAGLINE, BRAND_COLOR_HEX, BRAND_COLOR_ANSI, BRAND_COLOR_ANSI_RESET } from './branding';
export { getRandomPhrase } from './phrases';
