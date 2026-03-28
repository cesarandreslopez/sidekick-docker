export interface LogTemplate {
  /** Template pattern with <*> wildcards replacing variable parts */
  pattern: string;
  /** Number of log lines matching this template */
  count: number;
  /** Token count (for grouping) */
  tokenCount: number;
}

export interface TemplateDiagnostics {
  groupCount: number;
  droppedGroups: number;
  totalLines: number;
}

// Tokens that look like variable data (hex IDs, numbers, UUIDs, IPs, etc.)
const VARIABLE_PATTERNS = [
  /^[0-9a-f]{8,}$/i,          // hex strings (hashes, IDs)
  /^[0-9a-f]{8}-[0-9a-f]{4}-/i, // UUIDs
  /^\d+\.\d+\.\d+\.\d+/,     // IP addresses
  /^\d{4}-\d{2}-\d{2}/,       // dates
  /^\d+$/,                     // pure numbers
  /^\/[\w/.-]+$/,              // paths
  /^https?:\/\//,              // URLs
  /^"[^"]*"$/,                 // quoted strings
  /^'[^']*'$/,                 // single-quoted strings
];

function isVariable(token: string): boolean {
  return VARIABLE_PATTERNS.some(p => p.test(token));
}

const DEFAULT_MAX_GROUPS = 500;

/**
 * Simplified Drain-like log template engine.
 *
 * Groups log lines by:
 * 1. Token count (split by whitespace)
 * 2. Token-by-token comparison within same-length groups
 * 3. Tokens that differ between lines become <*> wildcards
 *
 * This is a simplified version that works well for most log formats
 * without the full tree structure of the Drain3 algorithm.
 */
export class LogTemplateEngine {
  // Group templates by token count for efficient lookup
  private groups = new Map<number, TemplateGroup[]>();
  private totalLines = 0;
  private groupCount = 0;
  private droppedGroups = 0;
  private readonly maxGroups: number;

  constructor(maxGroups = DEFAULT_MAX_GROUPS) {
    this.maxGroups = maxGroups;
  }

  /**
   * Process a log line and update templates.
   */
  push(line: string): void {
    this.totalLines++;
    const tokens = tokenize(line);
    if (tokens.length === 0) return;

    const groups = this.groups.get(tokens.length);
    if (!groups) {
      if (this.groupCount >= this.maxGroups) {
        this.droppedGroups++;
        return;
      }
      this.groups.set(tokens.length, [{ tokens: tokens.map(t => isVariable(t) ? '<*>' : t), count: 1 }]);
      this.groupCount++;
      return;
    }

    // Find best matching group
    let bestMatch: TemplateGroup | null = null;
    let bestScore = 0;

    for (const group of groups) {
      let matching = 0;
      for (let i = 0; i < tokens.length; i++) {
        if (group.tokens[i] === '<*>' || group.tokens[i] === tokens[i]) {
          matching++;
        }
      }
      const score = matching / tokens.length;
      if (score > bestScore && score >= 0.5) {
        bestScore = score;
        bestMatch = group;
      }
    }

    if (bestMatch) {
      bestMatch.count++;
      // Merge: positions that differ become wildcards
      for (let i = 0; i < tokens.length; i++) {
        if (bestMatch.tokens[i] !== '<*>' && bestMatch.tokens[i] !== tokens[i]) {
          bestMatch.tokens[i] = '<*>';
        }
      }
    } else if (this.groupCount < this.maxGroups) {
      // New template group
      groups.push({ tokens: tokens.map(t => isVariable(t) ? '<*>' : t), count: 1 });
      this.groupCount++;
    } else {
      this.droppedGroups++;
    }
  }

  /**
   * Get all templates sorted by frequency (most common first).
   */
  getTemplates(limit = 20): LogTemplate[] {
    const all: LogTemplate[] = [];
    for (const [tokenCount, groups] of this.groups) {
      for (const group of groups) {
        all.push({
          pattern: group.tokens.join(' '),
          count: group.count,
          tokenCount,
        });
      }
    }
    all.sort((a, b) => b.count - a.count);
    return all.slice(0, limit);
  }

  getTotalLines(): number {
    return this.totalLines;
  }

  getDiagnostics(): TemplateDiagnostics {
    return {
      groupCount: this.groupCount,
      droppedGroups: this.droppedGroups,
      totalLines: this.totalLines,
    };
  }

  reset(): void {
    this.groups.clear();
    this.totalLines = 0;
    this.groupCount = 0;
    this.droppedGroups = 0;
  }
}

interface TemplateGroup {
  tokens: string[];
  count: number;
}

function tokenize(line: string): string[] {
  // Split by whitespace, preserving tokens
  return line.split(/\s+/).filter(t => t.length > 0);
}
