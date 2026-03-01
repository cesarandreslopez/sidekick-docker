// Browser-compatible copy of sidekick-docker-shared/src/log/LogFilter.ts
import type { FilterMatch, FilterResult, FilterMode } from '../types/log';

export function exactMatch(line: string, query: string): FilterResult {
  if (!query) return { matched: true, matches: [] };
  const lower = line.toLowerCase();
  const queryLower = query.toLowerCase();
  const matches: FilterMatch[] = [];
  let pos = 0;
  while (pos < lower.length) {
    const idx = lower.indexOf(queryLower, pos);
    if (idx === -1) break;
    matches.push({ start: idx, length: queryLower.length });
    pos = idx + queryLower.length;
  }
  return { matched: matches.length > 0, matches };
}

export function fuzzyMatch(line: string, query: string): FilterResult {
  if (!query) return { matched: true, matches: [] };
  const words = query.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return { matched: true, matches: [] };
  const lower = line.toLowerCase();
  const matches: FilterMatch[] = [];
  for (const word of words) {
    const wordLower = word.toLowerCase();
    const idx = lower.indexOf(wordLower);
    if (idx === -1) return { matched: false, matches: [] };
    matches.push({ start: idx, length: wordLower.length });
  }
  matches.sort((a, b) => a.start - b.start);
  return { matched: true, matches };
}

export function filterLine(line: string, query: string, mode: FilterMode): FilterResult {
  return mode === 'exact' ? exactMatch(line, query) : fuzzyMatch(line, query);
}
