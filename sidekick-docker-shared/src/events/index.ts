/**
 * Docker event streaming with reconnection module.
 * @see specs/events/design.md
 */
export { EventWatcher } from './EventWatcher';
export type { EventWatcherCallbacks } from './EventWatcher';
export { ReconnectScheduler, INITIAL_RECONNECT_DELAY, MAX_RECONNECT_DELAY, MAX_RECONNECT_ATTEMPTS } from './reconnect';
