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
} from './formatters';

// Branding & phrases
export { BRAND_INLINE, BRAND_TAGLINE, BRAND_COLOR_HEX, BRAND_COLOR_ANSI, BRAND_COLOR_ANSI_RESET } from './branding';
export { getRandomPhrase } from './phrases';
