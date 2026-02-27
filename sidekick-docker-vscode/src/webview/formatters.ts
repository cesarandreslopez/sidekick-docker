import type { SerializedLogEntry } from '../types/messages';

// Pure formatters (duplicated from shared to avoid Node.js deps in browser bundle)

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

export function formatPorts(ports: { hostPort: number; containerPort: number; protocol: string }[]): string {
  return ports
    .filter(p => p.hostPort > 0)
    .map(p => `${p.hostPort}:${p.containerPort}/${p.protocol}`)
    .join(', ') || '-';
}

export function stateIcon(state: string): string {
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

export function stateColor(state: string): string {
  switch (state) {
    case 'running': return 'var(--vscode-testing-iconPassed, #3fb950)';
    case 'paused': return 'var(--vscode-editorWarning-foreground, #cca700)';
    case 'restarting': return 'var(--vscode-editorInfo-foreground, #3794ff)';
    case 'exited': return 'var(--vscode-errorForeground, #f85149)';
    case 'dead': return 'var(--vscode-errorForeground, #f85149)';
    case 'created': return 'var(--vscode-descriptionForeground)';
    case 'not_created': return 'var(--vscode-descriptionForeground)';
    case 'removing': return 'var(--vscode-editorWarning-foreground, #cca700)';
    default: return 'var(--vscode-foreground)';
  }
}

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 1) + '\u2026';
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function detectLogLevel(msg: string): string | null {
  const upper = msg.substring(0, 200).toUpperCase();
  if (/\b(FATAL|PANIC)\b/.test(upper)) return 'log-error';
  if (/\b(ERROR|ERR)\b/.test(upper)) return 'log-error';
  if (/\b(WARN|WARNING)\b/.test(upper)) return 'log-warn';
  if (/\b(INFO)\b/.test(upper)) return 'log-info';
  if (/\b(DEBUG|TRACE)\b/.test(upper)) return 'log-debug';
  return null;
}

export function colorizeLogEntry(entry: SerializedLogEntry): string {
  const ts = entry.timestamp ? entry.timestamp.substring(11, 23) : '';
  const tsHtml = ts ? `<span class="log-timestamp">${escapeHtml(ts)}</span> ` : '';

  if (entry.stream === 'stderr') {
    return `<span class="log-line">${tsHtml}<span class="log-stderr">${escapeHtml(entry.message)}</span></span>`;
  }

  const levelClass = detectLogLevel(entry.message);
  if (levelClass) {
    return `<span class="log-line">${tsHtml}<span class="${levelClass}">${escapeHtml(entry.message)}</span></span>`;
  }

  return `<span class="log-line">${tsHtml}${escapeHtml(entry.message)}</span>`;
}

// Detail panel colorize helpers


export function colorizeState(state: string): string {
  return `<span style="color:${stateColor(state)}">${escapeHtml(state)}</span>`;
}

export function colorizeBool(value: boolean): string {
  return value ? '<span class="detail-bool-yes">Yes</span>' : '<span class="detail-bool-no">No</span>';
}

export function colorizeId(id: string): string {
  return `<span class="detail-id">${escapeHtml(id)}</span>`;
}


export function renderKvGrid(pairs: [string, string][]): string {
  const rows = pairs.map(([key, valueHtml]) =>
    `<div class="kv-key">${escapeHtml(key)}</div><div class="kv-value">${valueHtml}</div>`
  ).join('');
  return `<div class="kv-grid">${rows}</div>`;
}

export function renderEnvGrid(envLines: string[]): string {
  const rows = [...envLines].sort().map(line => {
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) return `<div class="env-grid-key">${escapeHtml(line)}</div><div class="env-grid-value"></div>`;
    return `<div class="env-grid-key">${escapeHtml(line.substring(0, eqIdx))}</div><div class="env-grid-value">${escapeHtml(line.substring(eqIdx + 1))}</div>`;
  }).join('');
  return `<div class="env-grid">${rows}</div>`;
}

export function colorizeNetworkContainer(name: string, id: string): string {
  return `${escapeHtml(name)} (<span class="detail-id">${escapeHtml(id)}</span>)`;
}
