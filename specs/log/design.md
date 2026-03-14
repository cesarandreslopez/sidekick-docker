# log — Design Spec

## Purpose
Log analysis — tokenization, filtering, severity detection, parsing, template extraction, and time series. All pure functions with **zero Node.js dependencies** (regex and string manipulation only). This makes the module safe for browser bundles.

## Public Interface

Exports from `sidekick-docker-shared/src/log/index.ts`:

**Tokenization:**
- `tokenizeLogLine(message)` → LogToken[]
- `LogToken`, `LogTokenType`

**Filtering:**
- `exactMatch(line, query)` → FilterMatch[]
- `fuzzyMatch(line, query)` → FilterMatch[]
- `filterLine(line, query, mode)` → FilterResult
- `FilterMatch`, `FilterResult`, `FilterMode`

**Severity:**
- `LogAnalytics` — Tracks severity counts across log lines
- `detectSeverity(message)` → SeverityLevel
- `SeverityLevel`, `SeverityCounts`

**Parsing:**
- `detectFormat(message)` → LogFormat
- `parseLine(message)` → ParsedLogLine
- `LogFormat`, `ParsedLogLine`

**Time series:**
- `LogSeverityTimeSeries` — Time-bucketed severity counts for sparkline visualization
- `SeverityBucket`

**Templates:**
- `LogTemplateEngine` — Groups similar log lines into templates
- `LogTemplate`

## Internal Structure

```
sidekick-docker-shared/src/log/
├── LogTokenizer.ts              # Regex-based log line tokenization
├── LogTokenizer.test.ts
├── LogFilter.ts                 # Exact and fuzzy string matching
├── LogFilter.test.ts
├── LogParser.ts                 # Log format detection (JSON, syslog, etc.)
├── LogParser.test.ts
├── LogAnalytics.ts              # Severity detection and counting
├── LogAnalytics.test.ts
├── LogTemplateEngine.ts         # Log line template extraction
├── LogTemplateEngine.test.ts
├── LogSeverityTimeSeries.ts     # Time-bucketed severity tracking
├── LogSeverityTimeSeries.test.ts
└── index.ts                     # Barrel re-export
```

## Dependencies

- **Allowed imports**: None (leaf module — pure functions, no internal deps)
- **Forbidden imports**: Everything — this module must remain platform-agnostic

## Files to Move

| Source (current) | Destination (target) | Notes |
|-----------------|---------------------|-------|
| (all files stay in place) | — | No moves needed |

## Consolidation Plan (VSCode fork)

The VSCode package has a forked copy at `vscode/src/log/` (4 files: LogTokenizer, LogFilter, LogTemplateEngine, LogAnalytics). These are functionally identical to the shared originals and have no Node.js dependencies.

**Strategy:**
1. Add sub-path export to shared's `package.json`: `"./log": "./dist/log/index.js"`
2. Update VSCode webview esbuild config to allow importing `sidekick-docker-shared/log`
3. Delete `vscode/src/log/` (4 files, ~237 LOC)
4. Update all VSCode imports to use `sidekick-docker-shared/log`

**Also consolidate `vscode/src/types/log.ts`:**
- This file duplicates type definitions (LogTokenType, LogToken, FilterMatch, etc.)
- After sub-path export, replace with `import type { ... } from 'sidekick-docker-shared/log'`

## Open Questions

- Should we create separate sub-path exports per file (e.g., `shared/log/tokenizer`) or just the barrel `shared/log`? Barrel is simpler; per-file gives finer tree-shaking. Start with barrel.
