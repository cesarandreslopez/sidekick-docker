import type { SerializedLogEntry } from '../types/messages';
import type { LogTokenType, FilterMatch } from 'sidekick-docker-shared/log';
import { tokenizeLogLine } from 'sidekick-docker-shared/log';

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

const TOKEN_CSS_CLASSES: Record<LogTokenType, string | null> = {
  'severity-error': 'tok-sev-error',
  'severity-warn': 'tok-sev-warn',
  'severity-info': 'tok-sev-info',
  'severity-debug': 'tok-sev-debug',
  'http-method-safe': 'tok-http-safe',
  'http-method-unsafe': 'tok-http-unsafe',
  'http-status-2xx': 'tok-status-2xx',
  'http-status-3xx': 'tok-status-3xx',
  'http-status-4xx': 'tok-status-4xx',
  'http-status-5xx': 'tok-status-5xx',
  'url': 'tok-url',
  'ip-address': 'tok-ip',
  'timestamp': 'tok-timestamp',
  'json-key': 'tok-json-key',
  'state-ok': 'tok-state-ok',
  'state-fail': 'tok-state-fail',
  'path': 'tok-path',
  'number': null,
  'plain': null,
};

function colorizeTokensHtml(message: string): string {
  const tokens = tokenizeLogLine(message);
  return tokens.map(t => {
    const cls = TOKEN_CSS_CLASSES[t.type];
    const escaped = escapeHtml(t.text);
    return cls ? `<span class="${cls}">${escaped}</span>` : escaped;
  }).join('');
}

function highlightMatchesHtml(message: string, matches: FilterMatch[], wrapClass?: string): string {
  if (matches.length === 0) {
    return wrapClass ? `<span class="${wrapClass}">${escapeHtml(message)}</span>` : colorizeTokensHtml(message);
  }

  const sorted = [...matches].sort((a, b) => a.start - b.start);
  const parts: string[] = [];
  let pos = 0;

  for (const m of sorted) {
    if (m.start > pos) {
      const seg = message.slice(pos, m.start);
      parts.push(wrapClass ? `<span class="${wrapClass}">${escapeHtml(seg)}</span>` : escapeHtml(seg));
    }
    parts.push(`<mark class="log-match">${escapeHtml(message.slice(m.start, m.start + m.length))}</mark>`);
    pos = m.start + m.length;
  }

  if (pos < message.length) {
    const seg = message.slice(pos);
    parts.push(wrapClass ? `<span class="${wrapClass}">${escapeHtml(seg)}</span>` : escapeHtml(seg));
  }

  return parts.join('');
}

export function colorizeLogEntry(entry: SerializedLogEntry, filterMatches?: FilterMatch[]): string {
  const ts = entry.timestamp ? entry.timestamp.substring(11, 23) : '';
  const tsHtml = ts ? `<span class="log-timestamp">${escapeHtml(ts)}</span> ` : '';

  if (entry.stream === 'stderr') {
    const msgHtml = filterMatches && filterMatches.length > 0
      ? highlightMatchesHtml(entry.message, filterMatches, 'log-stderr')
      : `<span class="log-stderr">${escapeHtml(entry.message)}</span>`;
    return `<span class="log-line">${tsHtml}${msgHtml}</span>`;
  }

  if (filterMatches && filterMatches.length > 0) {
    return `<span class="log-line">${tsHtml}${highlightMatchesHtml(entry.message, filterMatches)}</span>`;
  }

  return `<span class="log-line">${tsHtml}${colorizeTokensHtml(entry.message)}</span>`;
}

// Detail panel colorize helpers


export function colorizeState(state: string): string {
  return `<span style="color:${stateColor(state)}">${escapeHtml(state)}</span>`;
}

export function colorizeHealth(status: 'healthy' | 'unhealthy' | 'starting'): string {
  const color = status === 'healthy' ? 'var(--vscode-testing-iconPassed, #3fb950)'
    : status === 'unhealthy' ? 'var(--vscode-errorForeground, #f85149)'
    : 'var(--vscode-editorWarning-foreground, #cca700)';
  return `<span style="color:${color}">${escapeHtml(status)}</span>`;
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

export function renderSparkline(values: number[], width = 40): string {
  if (values.length < 2) return '';
  const max = Math.max(...values, 1);
  const bars = '\u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588';
  const recent = values.slice(-width);
  const sparkline = recent.map(v => {
    const idx = Math.min(Math.floor((v / max) * (bars.length - 1)), bars.length - 1);
    return bars[idx];
  }).join('');
  return `<span class="sparkline">${sparkline}</span>`;
}
