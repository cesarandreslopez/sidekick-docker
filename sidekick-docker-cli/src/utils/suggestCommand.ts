/**
 * "Did you mean …?" for a mistyped subcommand. The root command has its own
 * action (the dashboard), so Commander treated `sidekick-docker pss` as an
 * extra argument to it ("too many arguments") and never suggested `ps`.
 * Same rules as Commander's own suggestions: at most 3 edits, more than 40%
 * similar, ties all listed.
 */

const MAX_DISTANCE = 3;
const MIN_SIMILARITY = 0.4;

/** Optimal string alignment distance (Damerau–Levenshtein, each substring edited once). */
export function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > MAX_DISTANCE) return Math.max(a.length, b.length);
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/** The closest command names to `word`, best distance only, sorted; empty when none is close. */
export function similarCommands(word: string, candidates: readonly string[]): string[] {
  let best = MAX_DISTANCE;
  let similar: string[] = [];
  for (const candidate of new Set(candidates)) {
    if (candidate.length <= 1) continue;
    const distance = editDistance(word, candidate);
    const length = Math.max(word.length, candidate.length);
    if ((length - distance) / length <= MIN_SIMILARITY) continue;
    if (distance < best) {
      best = distance;
      similar = [candidate];
    } else if (distance === best) {
      similar.push(candidate);
    }
  }
  return similar.sort((x, y) => x.localeCompare(y));
}

/** Commander's wording: "error: unknown command 'pss'" plus "(Did you mean ps?)" on its own line. */
export function unknownCommandMessage(word: string, candidates: readonly string[]): string {
  const similar = similarCommands(word, candidates);
  const hint = similar.length > 1 ? `\n(Did you mean one of ${similar.join(', ')}?)`
    : similar.length === 1 ? `\n(Did you mean ${similar[0]}?)`
    : '';
  return `error: unknown command '${word}'${hint}`;
}
