import type { SerializedLogEntry } from '../../types/messages';
import type { WebviewState } from '../state';
import { filterLine } from 'sidekick-docker-shared/log';
import { colorizeLogEntry, escapeAttr, escapeHtml } from '../formatters';

/**
 * An empty log pane says why, from its stream's state (shared emptyLogMessage
 * wording, as in the TUI): still waiting, the target is stopped, or the stream
 * was lost. It used to promise "Logs will appear…" in every case.
 */
export function renderEmptyLogPane(message: string): string {
  return `<div class="empty-state" data-log-empty><div class="empty-icon" aria-hidden="true">\u{1F4DC}</div><div class="empty-title">No logs yet</div><div class="empty-subtitle">${escapeHtml(message)}</div></div>`;
}

/**
 * The filter bar of a primary log pane (Containers and Services: the TUI
 * filters both). Only one primary pane is ever mounted, so the ids stay unique.
 */
export function renderLogFilterBar(state: WebviewState, matched: number): string {
  return `<div class="log-filter-bar">
      <input type="text" id="log-filter-input" placeholder="Filter logs..." aria-label="Filter logs" value="${escapeAttr(state.logFilterString)}">
      <button type="button" class="filter-mode" id="log-filter-mode" aria-label="Filter mode: ${state.logFilterMode}. Activate to toggle." title="Click to toggle">${state.logFilterMode}</button>
      <button type="button" class="copy-logs-btn" id="copy-logs-btn" title="Copy logs to clipboard (c)">Copy</button>
      <span class="match-count" data-log-match-count>${state.logFilterString ? `${matched} matches` : ''}</span>
    </div>`;
}

/** Log lines, narrowed by the log filter when one is set. */
export function renderLogLines(entries: readonly SerializedLogEntry[], state: WebviewState): { html: string; matched: number } {
  const query = state.logFilterString;
  let html = '';
  let matched = 0;
  for (const e of entries) {
    if (query) {
      const result = filterLine(e.message, query, state.logFilterMode);
      if (!result.matched) continue;
      html += colorizeLogEntry(e, result.matches);
    } else {
      html += colorizeLogEntry(e);
    }
    matched++;
  }
  return { html, matched };
}

export const NO_MATCHING_LOGS = '<div class="log-no-match">No matching logs</div>';
