import type { PortBinding, ContainerInfo } from './types';

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatCpu(percent: number): string {
  return `${percent.toFixed(1)}%`;
}

export function formatMemory(usage: number, limit: number): string {
  return `${formatBytes(usage)} / ${formatBytes(limit)}`;
}

export function formatPorts(ports: PortBinding[]): string {
  // Deduplicate: Docker reports the same mapping once per bind address (IPv4 + IPv6).
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const p of ports) {
    if (p.hostPort <= 0) continue;
    const label = `${p.hostPort}:${p.containerPort}/${p.protocol}`;
    if (seen.has(label)) continue;
    seen.add(label);
    parts.push(label);
  }
  return parts.join(', ') || '-';
}

export function stateIcon(state: ContainerInfo['state'] | 'not_created'): string {
  switch (state) {
    case 'running': return '\u25B6';
    case 'paused': return '\u275A\u275A';
    case 'restarting': return '\u21BB';
    case 'exited': return '\u25A0';
    case 'dead': return '\u2620';
    case 'created': return '\u25CB';
    case 'not_created': return '\u25CB';
    case 'removing': return '\u2026';
    default: return '?';
  }
}

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 1) + '\u2026';
}

// Re-export Docker ID utilities from docker module
export { CONTAINER_ID_LENGTH, shortId } from './docker/utils';

/** Extract HH:MM:SS.mmm from an ISO timestamp string or Date. */
export function formatTimestampTime(timestamp: string | Date): string {
  const iso = typeof timestamp === 'string' ? timestamp : timestamp.toISOString();
  return iso.substring(11, 23);
}

export function stateColor(state: ContainerInfo['state'] | 'not_created'): string {
  switch (state) {
    case 'running': return 'green';
    case 'paused': return 'yellow';
    case 'restarting': return 'cyan';
    case 'exited': return 'red';
    case 'dead': return 'red';
    case 'created': return 'gray';
    case 'not_created': return 'gray';
    case 'removing': return 'yellow';
    default: return 'white';
  }
}

// ─── Shared UI policy ────────────────────────────────────────────────
// Both dashboards (TUI and VS Code webview) word and gate actions through
// these, so the two surfaces cannot drift apart. Browser-safe: the webview
// bundle imports this file.

type ContainerState = ContainerInfo['state'];

/** Docker only starts a created or exited container; a paused one needs unpause. */
export function canStart(state: ContainerState): boolean {
  return state === 'exited' || state === 'created';
}

/** Stop applies to anything with a live process, paused or restarting included. */
export function canStop(state: ContainerState): boolean {
  return state === 'running' || state === 'paused' || state === 'restarting';
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export type PruneKind = 'containers' | 'images' | 'volumes' | 'networks';

interface PruneCandidateFields {
  state?: string;
  isDangling?: boolean;
  isInUse?: boolean;
  isDefault?: boolean;
  containers?: readonly unknown[];
}

/** How many items a prune of `kind` would remove, from the listed items. */
export function pruneCandidateCount(kind: PruneKind, items: readonly PruneCandidateFields[]): number {
  switch (kind) {
    case 'containers': return items.filter(c => c.state === 'exited' || c.state === 'created' || c.state === 'dead').length;
    case 'images': return items.filter(i => i.isDangling).length;
    case 'volumes': return items.filter(v => !v.isInUse).length;
    case 'networks': return items.filter(n => !n.isDefault && (n.containers?.length ?? 0) === 0).length;
  }
}

/** Confirmation text for a prune, naming how many items it removes when known. */
export function pruneConfirmMessage(kind: PruneKind, count: number): string {
  switch (kind) {
    case 'containers': return count > 0 ? `Remove ${plural(count, 'stopped container')}?` : 'Remove all stopped containers?';
    case 'images': return count > 0 ? `Prune ${plural(count, 'dangling image')}?` : 'Prune all dangling images?';
    case 'volumes': return count > 0 ? `Prune ${plural(count, 'unused volume')}?` : 'Prune all unused volumes?';
    case 'networks': return count > 0 ? `Prune ${plural(count, 'unused network')}?` : 'Prune all unused networks?';
  }
}

/** Both dashboards remove with force, so say so when that kills a live process. */
export function removeContainerConfirmMessage(c: { name: string; state: ContainerState }): string {
  return canStop(c.state)
    ? `Force-remove ${c.state} container "${c.name}"? It will be stopped first.`
    : `Remove container "${c.name}"?`;
}

export type ContainerSortField = 'state' | 'name' | 'cpu' | 'mem' | 'net' | 'io' | 'pids';

/**
 * What the current container order means, in words. "Ascending" was wrong for
 * half the fields: the default order is A→Z for names but highest-first for
 * every stats field.
 */
export function sortDirectionLabel(field: ContainerSortField, reversed: boolean): string {
  switch (field) {
    case 'state': return reversed ? 'stopped first' : 'running first';
    case 'name': return reversed ? 'Z→A' : 'A→Z';
    default: return reversed ? 'lowest first' : 'highest first';
  }
}

const WILDCARD_HOSTS = new Set(['', '0.0.0.0', '::', '[::]']);
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);
const TLS_PORTS = new Set([443, 8443]);

function urlHost(host: string): string {
  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
}

/**
 * Browser URLs for a container's published TCP ports, one per host port
 * (Docker reports IPv4 and IPv6 bindings separately). `host` is where the
 * daemon runs — see {@link browserHostForEndpoint}. A port bound to one
 * specific, non-loopback address is opened on that address.
 */
export function publishedPortUrls(ports: readonly PortBinding[], host: string): string[] {
  const seen = new Set<number>();
  const urls: string[] = [];
  for (const p of ports) {
    if (p.protocol !== 'tcp' || p.hostPort <= 0 || seen.has(p.hostPort)) continue;
    seen.add(p.hostPort);
    const target = WILDCARD_HOSTS.has(p.hostIp) || LOOPBACK_HOSTS.has(p.hostIp) ? host : p.hostIp;
    const scheme = TLS_PORTS.has(p.containerPort) || TLS_PORTS.has(p.hostPort) ? 'https' : 'http';
    urls.push(`${scheme}://${urlHost(target)}:${p.hostPort}`);
  }
  return urls;
}

/**
 * The host published ports live on: the daemon's host for a tcp/ssh/http
 * endpoint, otherwise (local socket, named pipe, default) `localhost`.
 */
export function browserHostForEndpoint(endpoint: string | undefined): string {
  const value = endpoint?.trim() ?? '';
  const m = /^(?:tcp|https?|ssh):\/\/(?:[^@/]*@)?(\[[^\]]+\]|[^:/]+)/i.exec(value);
  if (!m) return 'localhost';
  return m[1].replace(/^\[|\]$/g, '');
}

export type ActionType = 'start' | 'stop' | 'restart' | 'pause' | 'unpause' | 'remove' | 'up' | 'down' | 'prune';

const ACTION_TEXT: Record<ActionType, { progress: (name: string) => string; success: (name: string) => string }> = {
  start: { progress: n => `Starting ${n}…`, success: n => `Started ${n}` },
  stop: { progress: n => `Stopping ${n}…`, success: n => `Stopped ${n}` },
  restart: { progress: n => `Restarting ${n}…`, success: n => `Restarted ${n}` },
  pause: { progress: n => `Pausing ${n}…`, success: n => `Paused ${n}` },
  unpause: { progress: n => `Unpausing ${n}…`, success: n => `Unpaused ${n}` },
  remove: { progress: n => `Removing ${n}…`, success: n => `Removed ${n}` },
  up: { progress: n => `Bringing ${n} up…`, success: n => `${n} is up` },
  down: { progress: n => `Taking ${n} down…`, success: n => `${n} is down` },
  prune: { progress: n => `Pruning ${n}…`, success: n => `Pruned ${n}` },
};

/** Progress and success wording for an action on `name`, shared by both dashboards. */
export function actionText(type: ActionType, name: string): { progress: string; success: string } {
  const t = ACTION_TEXT[type];
  return { progress: t.progress(name), success: t.success(name) };
}

/** "unless-stopped", "on-failure (max 5)", "no" — plus how often it has restarted. */
export function summarizeRestartPolicy(policy: { name: string; maximumRetryCount: number }, restartCount = 0): string {
  const name = policy.name || 'no';
  const base = name === 'on-failure' && policy.maximumRetryCount > 0 ? `on-failure (max ${policy.maximumRetryCount})` : name;
  return restartCount > 0 ? `${base} · restarted ${restartCount}×` : base;
}

/** "pgdata → /var/lib/postgresql/data (volume)", "/srv/conf → /etc/app (bind, ro)". */
export function formatMount(m: { type: string; name?: string; source: string; destination: string; readOnly: boolean }): string {
  const from = m.name || m.source || '(anonymous)';
  const tags = [m.type || 'mount', ...(m.readOnly ? ['ro'] : [])].join(', ');
  return `${from} → ${m.destination} (${tags})`;
}

/**
 * Health detail beyond the (healthy)/(unhealthy) badge: the failing streak and
 * what the last probe printed — usually the actual reason a container is
 * unhealthy. Empty when the container has no healthcheck.
 */
export function summarizeHealth(health: { status: string; failingStreak: number; log: readonly { exitCode: number; output: string }[] } | null): string[] {
  if (!health) return [];
  const lines = [health.failingStreak > 0
    ? `${health.status} · ${health.failingStreak} failing check${health.failingStreak === 1 ? '' : 's'} in a row`
    : health.status];
  const last = health.log[health.log.length - 1];
  if (last) {
    const output = last.output.split('\n').map(l => l.trim()).filter(Boolean).slice(-3).join(' ⏎ ');
    lines.push(`Last check: exit ${last.exitCode}${output ? ` — ${truncate(output, 200)}` : ''}`);
  }
  return lines;
}
