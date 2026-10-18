/**
 * Shared domain state: one refresh/event policy for both dashboards.
 * @see specs/state/design.md
 */
export { DockerStateStore } from './DockerStateStore';
export type { DockerStateSnapshot, DockerStateStoreOptions, StoreChange } from './DockerStateStore';
export { classifyEvent, applyEffect, splitEventAction } from './eventPolicy';
export type { EventEffect, ResourceKind } from './eventPolicy';
