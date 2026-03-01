// Browser-compatible copy of sidekick-docker-shared/src/log/LogTemplateEngine.ts

export interface LogTemplate {
  pattern: string;
  count: number;
  tokenCount: number;
}

const VARIABLE_PATTERNS = [
  /^[0-9a-f]{8,}$/i,
  /^[0-9a-f]{8}-[0-9a-f]{4}-/i,
  /^\d+\.\d+\.\d+\.\d+/,
  /^\d{4}-\d{2}-\d{2}/,
  /^\d+$/,
  /^\/[\w/.-]+$/,
  /^https?:\/\//,
  /^"[^"]*"$/,
  /^'[^']*'$/,
];

function isVariable(token: string): boolean {
  return VARIABLE_PATTERNS.some(p => p.test(token));
}

interface TemplateGroup {
  tokens: string[];
  count: number;
}

export class LogTemplateEngine {
  private groups = new Map<number, TemplateGroup[]>();
  private totalLines = 0;

  push(line: string): void {
    this.totalLines++;
    const tokens = line.split(/\s+/).filter(t => t.length > 0);
    if (tokens.length === 0) return;

    const groups = this.groups.get(tokens.length);
    if (!groups) {
      this.groups.set(tokens.length, [{ tokens: tokens.map(t => isVariable(t) ? '<*>' : t), count: 1 }]);
      return;
    }

    let bestMatch: TemplateGroup | null = null;
    let bestScore = 0;

    for (const group of groups) {
      let matching = 0;
      for (let i = 0; i < tokens.length; i++) {
        if (group.tokens[i] === '<*>' || group.tokens[i] === tokens[i]) matching++;
      }
      const score = matching / tokens.length;
      if (score > bestScore && score >= 0.5) {
        bestScore = score;
        bestMatch = group;
      }
    }

    if (bestMatch) {
      bestMatch.count++;
      for (let i = 0; i < tokens.length; i++) {
        if (bestMatch.tokens[i] !== '<*>' && bestMatch.tokens[i] !== tokens[i]) {
          bestMatch.tokens[i] = '<*>';
        }
      }
    } else {
      groups.push({ tokens: tokens.map(t => isVariable(t) ? '<*>' : t), count: 1 });
    }
  }

  getTemplates(limit = 20): LogTemplate[] {
    const all: LogTemplate[] = [];
    for (const [tokenCount, groups] of this.groups) {
      for (const group of groups) {
        all.push({ pattern: group.tokens.join(' '), count: group.count, tokenCount });
      }
    }
    all.sort((a, b) => b.count - a.count);
    return all.slice(0, limit);
  }

  reset(): void {
    this.groups.clear();
    this.totalLines = 0;
  }
}
