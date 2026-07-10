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
