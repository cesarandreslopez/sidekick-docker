/**
 * Wording for resources a refresh could not list. The warning used to name
 * only the kinds ("images unavailable"), never why, so a permissions problem
 * and a timeout looked the same.
 */

/** "images, volumes unavailable: <reason>[; <other reason>]", or null when everything listed. */
export function unavailableText(errors: Readonly<Record<string, string>> | undefined): string | null {
  const kinds = Object.keys(errors ?? {});
  if (kinds.length === 0) return null;
  const reasons = [...new Set(kinds.map(k => errors?.[k] ?? '').filter(Boolean))];
  return `${kinds.join(', ')} unavailable${reasons.length ? `: ${reasons.join('; ')}` : ''}`;
}

/** The Ctrl+R result toast. */
export function refreshResultText(errors: Readonly<Record<string, string>> | undefined): { text: string; severity: 'success' | 'warning' } {
  const failed = unavailableText(errors);
  return failed ? { text: `Refreshed — ${failed}`, severity: 'warning' } : { text: 'Refreshed', severity: 'success' };
}

/** The warning shown once on startup when some resources could not be listed. */
export function startupWarningText(errors: Readonly<Record<string, string>> | undefined): string | null {
  const failed = unavailableText(errors);
  return failed ? `${failed.charAt(0).toUpperCase()}${failed.slice(1)}` : null;
}
