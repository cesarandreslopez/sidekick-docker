import { actionText } from 'sidekick-docker-shared';
import type { ActionType } from 'sidekick-docker-shared';

/**
 * Per item+action single-flight for user actions. A second press of the same
 * action on the same item while the first still ran used to issue a second
 * Docker call — a second stop on a container mid-SIGTERM, a second
 * `compose up` racing the first.
 */
export class InFlightActions {
  private readonly running = new Set<string>();

  /**
   * Run `fn` unless the same key is already running; a duplicate calls
   * `onDuplicate` instead and resolves without running anything.
   */
  async run(key: string, fn: () => Promise<void>, onDuplicate?: () => void): Promise<void> {
    if (this.running.has(key)) {
      onDuplicate?.();
      return;
    }
    this.running.add(key);
    try {
      await fn();
    } finally {
      this.running.delete(key);
    }
  }

  isRunning(key: string): boolean {
    return this.running.has(key);
  }
}

/** "Already stopping web…": the shared progress wording of the action still running. */
export function alreadyRunningText(type: string, name: string): string {
  const known = ['start', 'stop', 'restart', 'pause', 'unpause', 'remove', 'up', 'down', 'prune'];
  if (!known.includes(type)) return `Already running ${type} on ${name}`;
  const progress = actionText(type as ActionType, name).progress;
  return `Already ${progress.charAt(0).toLowerCase()}${progress.slice(1)}`;
}
