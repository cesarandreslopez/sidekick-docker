/**
 * Docker Compose operations module.
 * @see specs/compose/design.md
 */
export { ComposeClient, ComposeError, composeFailureReason, throwIfComposeFailed } from './ComposeClient';
export type { ComposeExecResult } from './ComposeClient';
export { ComposeDetector } from './ComposeDetector';
export type { ComposeProjectSource } from './ComposeDetector';
export { ComposeFileReader } from './ComposeFileReader';
export type { ComposeFileConfig, ComposeFileServiceConfig } from './ComposeFileReader';
