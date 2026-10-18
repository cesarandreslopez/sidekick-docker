/**
 * Docker Compose operations module.
 * @see specs/compose/design.md
 */
export { ComposeClient, ComposeError, composeFailureReason, throwIfComposeFailed } from './ComposeClient';
export type { ComposeExecResult, ComposeClientOptions } from './ComposeClient';
export { runProcess, TIMEOUT_EXIT_CODE } from './process';
export type { RunProcessOptions } from './process';
export { ComposeDetector } from './ComposeDetector';
export type { ComposeProjectSource } from './ComposeDetector';
export { resolveComposeCwd, resolveComposeOptions } from './composeCwd';
export type { ComposeProjectSourceLocation, ComposeCommandOptions } from './composeCwd';
export { ComposeFileReader } from './ComposeFileReader';
export type { ComposeFileConfig, ComposeFileServiceConfig, ComposeFileReaderOptions, ComposeReadResult } from './ComposeFileReader';
