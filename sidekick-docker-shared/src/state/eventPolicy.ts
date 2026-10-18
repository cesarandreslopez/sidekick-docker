import type { ContainerInfo } from '../types/container';
import type { DockerEvent } from '../types/events';

/** Resource lists a refresh pass can fetch. `services` is the compose file config. */
export type ResourceKind = 'containers' | 'images' | 'volumes' | 'networks' | 'services';

/** What one Docker event means for the dashboard's state. */
export type EventEffect =
  | { kind: 'ignore' }
  | { kind: 'patch'; containerId: string; patch: Partial<ContainerInfo>; refresh: ResourceKind[] }
  | { kind: 'remove'; containerId: string }
  | { kind: 'refresh'; resources: ResourceKind[] };

/**
 * Docker reports an event's action as its type, and some actions carry a
 * detail after a colon: `health_status: healthy`, `exec_create: /bin/sh -c …`.
 */
export function splitEventAction(type: string): { verb: string; detail?: string } {
  const i = type.indexOf(':');
  if (i < 0) return { verb: type.trim() };
  return { verb: type.slice(0, i).trim(), detail: type.slice(i + 1).trim() };
}

const IGNORE: EventEffect = { kind: 'ignore' };

/**
 * Container verbs that change nothing the dashboard shows. Healthchecks alone
 * emit exec_create/exec_start/exec_die every interval for every container;
 * treating them as refresh triggers kept refreshes running back-to-back on
 * busy hosts. kill and oom are always followed by die, which is handled.
 */
const IGNORED_CONTAINER_VERBS = new Set([
  'exec_create', 'exec_start', 'exec_die', 'exec_detach',
  'attach', 'detach', 'resize', 'top', 'export', 'copy',
  'archive-path', 'extract-to-dir', 'commit', 'kill', 'oom',
]);

const IGNORED_IMAGE_VERBS = new Set(['push', 'save']);
/** mount/unmount fire on every container start and stop. */
const IGNORED_VOLUME_VERBS = new Set(['mount', 'unmount']);

const HEALTH: Record<string, ContainerInfo['healthStatus']> = {
  healthy: 'healthy',
  unhealthy: 'unhealthy',
  starting: 'starting',
};

/** Pure: map a Docker event to its effect on dashboard state. */
export function classifyEvent(e: DockerEvent): EventEffect {
  const { verb, detail } = splitEventAction(e.type);
  switch (e.resourceType) {
    case 'container':
      return classifyContainerEvent(e.resourceId, verb, detail);
    case 'image':
      return IGNORED_IMAGE_VERBS.has(verb) ? IGNORE : { kind: 'refresh', resources: ['images'] };
    case 'volume':
      return IGNORED_VOLUME_VERBS.has(verb) ? IGNORE : { kind: 'refresh', resources: ['volumes'] };
    case 'network':
      return { kind: 'refresh', resources: ['networks'] };
    default:
      // daemon-scoped events (plugins, secrets, swarm services…) are not shown.
      return IGNORE;
  }
}

function classifyContainerEvent(id: string, verb: string, detail: string | undefined): EventEffect {
  if (IGNORED_CONTAINER_VERBS.has(verb)) return IGNORE;
  switch (verb) {
    case 'start':
    case 'unpause':
    case 'restart':
      // Patch at once for responsiveness, then re-sync the real status text,
      // ports and attachments.
      return { kind: 'patch', containerId: id, patch: { state: 'running', status: 'Up just now' }, refresh: ['containers', 'volumes', 'networks'] };
    case 'stop':
    case 'die':
      return { kind: 'patch', containerId: id, patch: { state: 'exited', status: 'Exited' }, refresh: [] };
    case 'pause':
      return { kind: 'patch', containerId: id, patch: { state: 'paused' }, refresh: [] };
    case 'destroy':
      return { kind: 'remove', containerId: id };
    case 'health_status': {
      const health = HEALTH[detail ?? ''];
      return health ? { kind: 'patch', containerId: id, patch: { healthStatus: health }, refresh: [] } : IGNORE;
    }
    default:
      // create, rename, update, and anything Docker adds later: re-list, debounced.
      return { kind: 'refresh', resources: ['containers'] };
  }
}

const HEALTH_SUFFIX = /\s*\((?:healthy|unhealthy|health: starting)\)$/;
const HEALTH_TEXT: Record<NonNullable<ContainerInfo['healthStatus']>, string> = {
  healthy: '(healthy)',
  unhealthy: '(unhealthy)',
  starting: '(health: starting)',
};

/**
 * Pure: apply a patch/remove effect. Returns the same array when nothing
 * changed, otherwise a new array with a new object for the touched container
 * (inputs are never mutated).
 */
export function applyEffect(containers: ContainerInfo[], eff: EventEffect): ContainerInfo[] {
  if (eff.kind === 'remove') {
    return containers.some(c => c.id === eff.containerId)
      ? containers.filter(c => c.id !== eff.containerId)
      : containers;
  }
  if (eff.kind !== 'patch') return containers;
  const i = containers.findIndex(c => c.id === eff.containerId);
  if (i < 0) return containers;
  const prev = containers[i];
  const next: ContainerInfo = { ...prev, ...eff.patch };
  if (eff.patch.healthStatus && eff.patch.status === undefined) {
    next.status = `${prev.status.replace(HEALTH_SUFFIX, '')} ${HEALTH_TEXT[eff.patch.healthStatus]}`;
  }
  if (next.state === prev.state && next.status === prev.status && next.healthStatus === prev.healthStatus) return containers;
  const out = containers.slice();
  out[i] = next;
  return out;
}
