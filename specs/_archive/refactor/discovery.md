# Codebase Discovery — 2026-03-14

## Vital Statistics
- Total TS/TSX files: 109 (38 shared, 49 CLI, 22 VSCode)
- Total lines of code: 13,179 (3,580 shared, 5,618 CLI, 3,981 VSCode)
- Framework(s): Ink 6 + React 19 (TUI), VSCode Extension API (extension), esbuild (CLI/VSCode bundler), tsc (shared)
- Node version: v24.13.1
- TypeScript version: ^5.7.0 (resolved 5.9.3)
- Strict mode: **enabled** in all 3 packages
- Module system: CommonJS (shared dist), ESM (CLI, `"type": "module"`), CommonJS (VSCode extension)
- Bundler/build: tsc → dist/ (shared), esbuild → dist/sidekick-docker.mjs (CLI), esbuild → out/ (VSCode, dual CJS+IIFE)
- Entry point(s):
  - `sidekick-docker-cli/src/cli.ts` (Commander.js CLI)
  - `sidekick-docker-cli/src/commands/dashboard.ts` (TUI wiring)
  - `sidekick-docker-shared/src/index.ts` (shared barrel)
  - `sidekick-docker-vscode/src/extension.ts` (VSCode activation)

## Current Structure

```
sidekick-docker-shared/src/
├── compose/          ComposeClient, ComposeDetector, ComposeFileReader, schemas
├── docker/           DockerClient (dockerode facade), schemas (Zod)
├── events/           EventWatcher
├── log/              LogParser, LogTokenizer, LogFilter, LogTemplateEngine, LogAnalytics, LogSeverityTimeSeries
├── stats/            StatsCollector
├── types/            container, image, volume, network, compose, events (barrel: index.ts)
├── branding.ts       Brand constants
├── errors.ts         errorMessage() helper
├── formatters.ts     formatBytes, formatCpu, stateIcon, etc.
├── index.ts          Barrel re-export
├── phrases.ts        738-line joke list
└── reconnect.ts      ReconnectScheduler

sidekick-docker-cli/src/
├── commands/         dashboard, logs, ps (Commander actions)
├── dashboard/
│   ├── ink/          Dashboard.tsx (533 LOC), 15 UI components, mouse/ subsystem
│   ├── panels/       ContainersPanel, ServicesPanel, ImagesPanel, VolumesPanel, NetworksPanel, types
│   ├── DockerState.ts          Domain state management
│   ├── LogStreamManager.ts     Log streaming
│   ├── StatsStreamManager.ts   Stats streaming
│   ├── ComposeLogStreamManager.ts
│   ├── ExecManager.ts
│   ├── branding.ts
│   └── phrases.ts              *** DUPLICATE of shared/phrases.ts ***
├── utils/            clipboard.ts
├── cli.ts            CLI entry point
└── formatters.ts     CLI-specific formatting (233 LOC)

sidekick-docker-vscode/src/
├── log/              LogTokenizer, LogFilter, LogTemplateEngine, LogAnalytics
│                     *** FORKED from shared/log/ (adapted for browser, no Node deps) ***
├── providers/        DockerDashboardProvider (959 LOC), ContainerTreeProvider
├── services/         DockerService (476 LOC), ContainerWatcherService
├── types/            messages, messageSchemas, log
├── utils/            nonce.ts
├── webview/
│   ├── panels/       containers, services, images, volumes, networks, types
│   ├── dashboard.ts  776 LOC webview entry
│   ├── state.ts
│   └── formatters.ts *** FORKED from shared/formatters.ts (browser-adapted) ***
└── extension.ts      VSCode activation
```

## Problem Areas

| File | Lines | Why it's a problem |
|------|-------|--------------------|
| `vscode/providers/DockerDashboardProvider.ts` | 959 | God class: webview lifecycle, message handling, Docker ops, state sync — all in one |
| `vscode/webview/dashboard.ts` | 776 | Monolithic webview entry: event handling, DOM manipulation, panel routing |
| `shared/phrases.ts` | 738 | Exact duplicate in `cli/dashboard/phrases.ts` — 738 lines copied verbatim |
| `cli/dashboard/phrases.ts` | 738 | Exact duplicate of shared/phrases.ts (unnecessary copy) |
| `cli/dashboard/ink/Dashboard.tsx` | 533 | 29 imports, giant component: state, rendering, keyboard, panels, overlays |
| `vscode/services/DockerService.ts` | 476 | Partial reimplementation of shared DockerClient for VSCode context |
| `shared/docker/DockerClient.ts` | 451 | Moderate size but core facade — changes ripple everywhere (7 git touches) |
| `cli/dashboard/ink/useKeyboardHandler.ts` | 361 | Single hook handling all keyboard input — high cognitive load |
| `cli/dashboard/panels/ContainersPanel.ts` | 308 | Panel with embedded formatting, detail tabs, action handling |
| `vscode/log/*` (4 files) | 237 | **Forked** from shared/log/ — diverged copies, will drift further |
| `vscode/webview/formatters.ts` | 195 | **Forked** from shared/formatters.ts — browser-adapted copy |

## Dependency Hotspots

### Files with most importers (high fan-in)
| Import target | Import count |
|---------------|-------------|
| `sidekick-docker-shared` (barrel) | 47 |
| `react` | 21 |
| `ink` | 18 |
| `./types` (various) | 17 |
| `vitest` | 15 |
| `../panels/types` | 8 |
| `../DockerState` | 7 |
| `../../types/messages` | 6 |
| `../state` | 6 |
| `./LogAnalytics` | 6 |
| `../formatters` / `../../formatters` | 12 (combined) |

### Files with most imports (high fan-out)
| File | Import count |
|------|-------------|
| `cli/dashboard/ink/Dashboard.tsx` | 29 |
| `cli/commands/dashboard.ts` | 17 |
| `vscode/webview/dashboard.ts` | 11 |
| `vscode/webview/panels/containers.ts` | 7 |
| `vscode/providers/DockerDashboardProvider.ts` | 6 |
| All 5 CLI panel files | 6 each |

## Circular Dependencies

**None detected.** Madge found zero circular dependencies across all three packages (individually and combined).

## Type Safety Gaps

- Files with `any` usage: **0** (the 2 grep hits are inside a joke string literal: `'as any: the TypeScript developer\'s white flag.'`)
- `@ts-ignore` / `@ts-expect-error` count: **0**
- Missing return types on exported functions: **0** (all exported functions have explicit return types)
- Strict mode: enabled in all 3 tsconfig.json files
- TypeScript compiles clean with `--noEmit` in all 3 packages

**Type safety is excellent** — no gaps found.

## Global / Singleton State

Most mutable state is properly scoped inside classes. Key observations:

| Location | Pattern | Risk |
|----------|---------|------|
| `shared/stats/StatsCollector.ts:10` | `private histories = new Map<>()` | Class-scoped, OK |
| `shared/compose/ComposeClient.ts:111-116` | `let stdoutBuffer`, `let done`, `let resolve` | Function-scoped async generator locals, OK |
| `shared/compose/ComposeDetector.ts:63` | `let status` | Function-local, OK |
| `shared/docker/DockerClient.ts:47` | `this.docker = new Dockerode(opts)` | Instance-scoped, OK |
| `shared/events/EventWatcher.ts:47` | `this.abortController = new AbortController()` | Instance-scoped, OK |
| `shared/log/LogTemplateEngine.ts:40` | `private groups = new Map<>()` | Class-scoped, OK |

**No true globals or singletons found.** All mutable state lives inside class instances or function scopes. The codebase has good state hygiene.

## Test Baseline

- Can tests run? **Yes**
- Test command: `npx vitest run` (per package)
- Test runner: vitest 3.2.4
- **Shared**: 10 test files, 88 tests, all passing (571ms)
- **CLI**: 5 test files, 69 tests, all passing (565ms)
- **VSCode**: No test files
- Total: **15 test files, 157 tests, all passing**

### Files without test coverage:

**Shared (9 files untested):**
- `compose/schemas.ts`, `compose/ComposeClient.ts`, `compose/ComposeFileReader.ts`
- `errors.ts`, `formatters.ts`, `branding.ts`, `docker/schemas.ts`, `reconnect.ts`, `phrases.ts`

**CLI (37 files untested):**
- All 5 panel files (`ContainersPanel`, `ServicesPanel`, `ImagesPanel`, `VolumesPanel`, `NetworksPanel`)
- All 15 Ink UI components (Dashboard.tsx, overlays, hooks, mouse system)
- All 3 command files (`cli.ts`, `dashboard.ts`, `logs.ts`, `ps.ts`)
- `ComposeLogStreamManager.ts`, `ExecManager.ts`, `branding.ts`, `phrases.ts` (dupe), `clipboard.ts`

**VSCode (22 files, 0 tested):**
- Entire package has zero tests

## Code Duplication Summary

| Duplicated content | Source | Copy | Notes |
|-------------------|--------|------|-------|
| `phrases.ts` (738 lines) | `shared/src/phrases.ts` | `cli/src/dashboard/phrases.ts` | Byte-for-byte identical |
| Log module (4 files, ~237 lines) | `shared/src/log/` | `vscode/src/log/` | Forked & adapted for browser (no Node deps) |
| `formatters.ts` (~195 lines) | `shared/src/formatters.ts` | `vscode/src/webview/formatters.ts` | Forked & adapted for browser (CSS colors vs ANSI) |

## Git Change Frequency (top 10 most-touched files)

| Commits | File |
|---------|------|
| 9 | `cli/dashboard/ink/Dashboard.tsx` |
| 8 | `vscode/providers/DockerDashboardProvider.ts` |
| 7 | `vscode/webview/dashboard.ts` |
| 7 | `vscode/services/DockerService.ts` |
| 7 | `shared/docker/DockerClient.ts` |
| 7 | `cli/commands/dashboard.ts` |
| 6 | `cli/dashboard/panels/ServicesPanel.ts` |
| 6 | `cli/dashboard/panels/ContainersPanel.ts` |
| 6 | `cli/dashboard/DockerState.ts` |
| 5 | `vscode/webview/panels/containers.ts` |

The most-changed files correlate strongly with the largest files — indicating ongoing churn in "god files" that would benefit most from decomposition.
