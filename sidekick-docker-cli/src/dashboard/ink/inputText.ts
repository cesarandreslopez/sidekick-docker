/**
 * Pure helpers for raw keyboard input. Ink hands useInput one chunk at a
 * time, and a chunk can hold several characters: a held key whose repeats
 * arrived together ("jjj"), or a paste.
 */

/**
 * The movement for a run of two or more identical `j` or `k` (positive is
 * down), else 0. A single key keeps its binding's own handling. Only
 * identical runs count: a pasted string is never split into keys, which
 * would fire whatever commands its letters name.
 */
export function navigationRun(input: string): number {
  if (input.length < 2) return 0;
  if (/^j+$/.test(input)) return input.length;
  if (/^k+$/.test(input)) return -input.length;
  return 0;
}

/** Typed or pasted text without C0 control characters and DEL (a pasted tab, newline or BEL). */
export function stripControlCharacters(text: string): string {
  return text.replace(/[\u0000-\u001f\u007f]/g, '');
}

/** How many tabs a chunk made only of tabs holds (a paste of them), else 0. */
export function tabRun(input: string): number {
  return /^\t+$/.test(input) ? input.length : 0;
}
