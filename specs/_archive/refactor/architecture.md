# Target Architecture

## Overview

The sidekick-docker monorepo contains 3 packages with 109 files and 13,179 LOC.
The existing directory structure is **largely correct** — modules are cohesive and
well-separated. This refactoring focuses on:

1. Eliminating cross-package duplication (phrases, log, formatters)
2. Adding explicit public APIs (barrel index.ts) per sub-module
3. Defining and enforcing strict dependency rules
4. Planning decomposition of god files (future phases)

## Modules

### Module 1: types
- **Package**: sidekick-docker-shared
- **Path**: `shared/src/types/`
- **Purpose**: Pure type definitions for all Docker resource types. The foundation layer — every other module depends on this.
- **Dependencies**: None (leaf module)
- **Public API**: Re-exports from `types/index.ts`: `ContainerInfo`, `ContainerStats`, `ContainerStatsHistory`, `LogEntry`, `PortBinding`, `ImageInfo`, `VolumeInfo`, `NetworkInfo`, `ComposeProject`, `ComposeService`, `DockerEvent`, `EventType`, `ResourceType`
- **Current files**: container.ts, image.ts, volume.ts, network.ts, compose.ts, events.ts, index.ts (7 files)
- **Changes needed**: None — already clean

### Module 2: docker
- **Package**: sidekick-docker-shared
- **Path**: `shared/src/docker/`
- **Purpose**: Docker Engine API facade via dockerode. All Docker daemon communication flows through `DockerClient`.
- **Dependencies**: types (internal), dockerode + zod (external)
- **Public API**: `DockerClient`, `DockerClientOptions`, `LogStreamOptions`
- **Current files**: DockerClient.ts, DockerClient.test.ts, schemas.ts (3 files)
- **Changes needed**: None — already clean

### Module 3: compose
- **Package**: sidekick-docker-shared
- **Path**: `shared/src/compose/`
- **Purpose**: Docker Compose operations via `docker compose` CLI subprocess. Detection, file reading, and project management.
- **Dependencies**: types (internal), zod (external)
- **Public API**: `ComposeClient`, `ComposeExecResult`, `ComposeDetector`, `ComposeFileReader`, `ComposeFileConfig`, `ComposeFileServiceConfig`
- **Current files**: ComposeClient.ts, ComposeDetector.ts, ComposeDetector.test.ts, ComposeFileReader.ts, schemas.ts (5 files)
- **Changes needed**: None — already clean

### Module 4: log
- **Package**: sidekick-docker-shared
- **Path**: `shared/src/log/`
- **Purpose**: Log analysis — tokenization, filtering, severity detection, parsing, template extraction, time series. All pure functions with **no Node.js dependencies** (regex + string manipulation only).
- **Dependencies**: None (leaf module — no internal deps)
- **Public API**: Via `log/index.ts`: `tokenizeLogLine`, `LogToken`, `LogTokenType`, `exactMatch`, `fuzzyMatch`, `filterLine`, `FilterMatch`, `FilterResult`, `FilterMode`, `LogAnalytics`, `detectSeverity`, `SeverityLevel`, `SeverityCounts`, `detectFormat`, `parseLine`, `LogFormat`, `ParsedLogLine`, `LogSeverityTimeSeries`, `SeverityBucket`, `LogTemplateEngine`, `LogTemplate`
- **Current files**: LogTokenizer.ts, LogFilter.ts, LogParser.ts, LogAnalytics.ts, LogTemplateEngine.ts, LogSeverityTimeSeries.ts, index.ts + 6 test files (13 files)
- **Changes needed**: Add sub-path export in shared package.json so VSCode webview can import without pulling Node deps

### Module 5: events
- **Package**: sidekick-docker-shared
- **Path**: `shared/src/events/` + `shared/src/reconnect.ts`
- **Purpose**: Real-time Docker event streaming with automatic reconnection.
- **Dependencies**: docker, types (internal)
- **Public API**: `EventWatcher`, `EventWatcherCallbacks`, `ReconnectScheduler`, `INITIAL_RECONNECT_DELAY`, `MAX_RECONNECT_DELAY`, `MAX_RECONNECT_ATTEMPTS`
- **Current files**: EventWatcher.ts, EventWatcher.test.ts (2 files) + reconnect.ts at shared root (1 file)
- **Changes needed**: Move `reconnect.ts` → `events/reconnect.ts` (only consumer is EventWatcher)

### Module 6: stats
- **Package**: sidekick-docker-shared
- **Path**: `shared/src/stats/`
- **Purpose**: Container resource usage stats collection with ring buffer history.
- **Dependencies**: types (internal)
- **Public API**: `StatsCollector`
- **Current files**: StatsCollector.ts, StatsCollector.test.ts (2 files)
- **Changes needed**: None — already clean

### Module 7: core
- **Package**: sidekick-docker-shared
- **Path**: `shared/src/` (root-level files)
- **Purpose**: Cross-cutting shared utilities — formatters, branding, phrases, error helpers, and the barrel index.
- **Dependencies**: types (formatters depend on types for PortBinding/ContainerInfo)
- **Public API**: `formatBytes`, `formatCpu`, `formatMemory`, `formatPorts`, `stateIcon`, `truncate`, `stateColor`, `errorMessage`, `BRAND_INLINE`, `BRAND_TAGLINE`, `BRAND_COLOR_HEX`, `BRAND_COLOR_ANSI`, `BRAND_COLOR_ANSI_RESET`, `getRandomPhrase`, `MAX_LOG_LINES`
- **Current files**: formatters.ts, branding.ts, phrases.ts, errors.ts, index.ts (5 files)
- **Changes needed**:
  - Add sub-path export for formatters so VSCode webview can import pure math formatters
  - Consider splitting formatters.ts: pure math functions (formatBytes, formatCpu, formatMemory, truncate) vs. Docker-domain functions (stateIcon, stateColor, formatPorts) — deferred to later phase

### Module 8: cli
- **Package**: sidekick-docker-cli
- **Path**: `cli/src/`
- **Purpose**: Terminal UI dashboard for Docker management. Ink 6 + React 19.
- **Dependencies**: shared (all modules), commander, ink, react (external)
- **Sub-modules**:
  - `commands/` — CLI entry point, Commander.js actions
  - `dashboard/` — DockerState, stream managers (LogStreamManager, StatsStreamManager, ComposeLogStreamManager, ExecManager)
  - `dashboard/panels/` — Panel implementations (Containers, Services, Images, Volumes, Networks)
  - `dashboard/ink/` — React/Ink UI components, hooks, overlays
  - `dashboard/ink/mouse/` — Mouse input subsystem
  - `formatters.ts` — CLI-specific ANSI formatters (re-exports shared pure formatters)
  - `utils/` — Clipboard helper
- **Current files**: 49 files (see file mapping below)
- **Changes needed**:
  - DELETE `dashboard/phrases.ts` — byte-for-byte duplicate of shared, import from shared instead
  - DELETE `dashboard/branding.ts` — subset of shared's branding.ts, import from shared instead
  - Future: decompose Dashboard.tsx (533 LOC, 29 imports) and useKeyboardHandler.ts (361 LOC)

### Module 9: vscode
- **Package**: sidekick-docker-vscode
- **Path**: `vscode/src/`
- **Purpose**: VSCode extension — webview dashboard, tree view, container management commands.
- **Dependencies**: shared (all modules), vscode API, zod (external)
- **Sub-modules**:
  - `extension.ts` — VSCode activation, command registration
  - `providers/` — DockerDashboardProvider (webview lifecycle), ContainerTreeProvider (tree view)
  - `services/` — DockerService (webview-bound Docker ops), ContainerWatcherService (always-on container tracking)
  - `types/` — Message types, Zod schemas, log type duplicates
  - `log/` — **FORKED** from shared/log/ (browser-adapted — but actually pure functions, no Node deps)
  - `webview/` — Browser-side dashboard code (state, panels, formatters)
  - `utils/` — nonce helper
- **Current files**: 22 files (see file mapping below)
- **Changes needed**:
  - Consolidate `log/` fork back to shared (via sub-path exports) — these are pure functions
  - DELETE `types/log.ts` — duplicate type definitions, import from shared
  - `webview/formatters.ts` stays — genuinely different output (HTML/CSS vs ANSI)
  - Future: decompose DockerDashboardProvider (959 LOC) and webview/dashboard.ts (776 LOC)

## Dependency DAG

```
                    ┌─────────┐
                    │  types  │  (Layer 0 — leaf)
                    └────┬────┘
          ┌──────────┬───┴───┬──────────┬──────────┐
          ▼          ▼       ▼          ▼          ▼
     ┌────────┐ ┌────────┐ ┌─────┐ ┌────────────┐ │
     │ docker │ │compose │ │stats│ │ formatters │ │
     │        │ │        │ │     │ │  (in core) │ │
     └───┬────┘ └────────┘ └─────┘ └────────────┘ │
         │                                         │
         ▼                                         │
     ┌────────┐                                    │
     │ events │◄── reconnect (in core) ────────────┘
     └────────┘

     ┌─────┐  (Layer 0 — leaf, no internal deps)
     │ log │
     └─────┘

     ┌─────────────────┐  (Layer 0 — leaf)
     │ core: branding,  │
     │ phrases, errors  │
     └─────────────────┘

                    ┌──────────────┐
                    │ shared/index │  (barrel — imports all above)
                    └──────┬───────┘
                ┌──────────┴──────────┐
                ▼                     ▼
          ┌──────────┐         ┌──────────┐
          │   cli    │         │  vscode  │
          └──────────┘         └──────────┘
```

**Rule: No arrows may point upward.** Arrows flow down from leaf modules to consumers.

### CLI Internal DAG

```
     ┌──────────────┐
     │    shared     │  (external dependency)
     └──────┬───────┘
    ┌───────┼───────────────┐
    ▼       ▼               ▼
┌──────┐ ┌──────────────┐ ┌────────────┐
│utils │ │dashboard/    │ │ formatters │
│      │ │  state       │ │            │
└──────┘ │(DockerState, │ └─────┬──────┘
         │ StreamMgrs)  │       │
         └──────┬───────┘       │
                │       ┌───────┘
                ▼       ▼
         ┌──────────────────┐
         │ dashboard/panels │
         └────────┬─────────┘
                  ▼
         ┌──────────────────┐
         │  dashboard/ink   │
         └────────┬─────────┘
                  ▼
         ┌──────────────────┐
         │    commands      │
         └──────────────────┘
```

### VSCode Internal DAG

```
     ┌──────────────┐
     │    shared     │  (external dependency)
     └──────┬───────┘
    ┌───────┼───────────────┐
    ▼       ▼               ▼
┌──────┐ ┌──────────────┐ ┌──────────────┐
│utils │ │  types       │ │  services    │
└──────┘ └──────┬───────┘ └──────┬───────┘
                │       ┌────────┘
                ▼       ▼
         ┌──────────────────┐
         │   providers      │
         └────────┬─────────┘
                  ▼
         ┌──────────────────┐
         │   extension.ts   │
         └──────────────────┘

--- Separate bundle (browser IIFE) ---

     ┌──────────────┐  ┌───────┐
     │  types       │  │  log  │  (shared via sub-path or local fork)
     └──────┬───────┘  └───┬───┘
            │      ┌───────┘
            ▼      ▼
     ┌──────────────────┐
     │ webview/state    │
     │ webview/fmts     │
     └────────┬─────────┘
              ▼
     ┌──────────────────┐
     │ webview/panels   │
     └────────┬─────────┘
              ▼
     ┌──────────────────┐
     │ webview/dashboard│
     └──────────────────┘
```

## Decisions

### D1: Keep the 3-package monorepo structure
**Decision**: The existing `shared` / `cli` / `vscode` package split is correct. Each package has distinct bundling requirements (tsc → CJS, esbuild → ESM, esbuild → CJS+IIFE). No need to restructure at the package level.

### D2: phrases.ts — delete CLI copy, import from shared
**Decision**: `cli/src/dashboard/phrases.ts` (738 lines) is byte-for-byte identical to `shared/src/phrases.ts`. Delete the copy and `import { getRandomPhrase } from 'sidekick-docker-shared'`. This is risk-free since esbuild bundles everything — no runtime resolution difference.

### D3: branding.ts — delete CLI copy, import from shared
**Decision**: `cli/src/dashboard/branding.ts` exports `BRAND_INLINE` and `BRAND_TAGLINE`, which are a subset of `shared/src/branding.ts`. Delete and import from shared.

### D4: VSCode log/ fork — consolidate via sub-path exports
**Decision**: The 4 files in `vscode/src/log/` (LogTokenizer, LogFilter, LogTemplateEngine, LogAnalytics) are forked from shared but the shared originals have **zero Node.js dependencies**. They're pure regex/string functions. The fork was unnecessary.
**Strategy**: Add sub-path exports to shared's `package.json`:
```json
"exports": {
  ".": "./dist/index.js",
  "./log": "./dist/log/index.js"
}
```
Then the VSCode webview esbuild config can bundle `sidekick-docker-shared/log` without pulling in dockerode. After that, delete the fork.
**Risk**: Low — functions are identical. Need to verify esbuild tree-shaking works correctly.

### D5: VSCode types/log.ts — consolidate with shared types
**Decision**: `vscode/src/types/log.ts` duplicates type definitions (`LogTokenType`, `LogToken`, `FilterMatch`, `FilterResult`, `FilterMode`, `SeverityLevel`, `SeverityCounts`) from shared. These should import from shared once sub-path exports exist.
**Strategy**: After D4, replace local types with `import type { ... } from 'sidekick-docker-shared/log'`.

### D6: VSCode webview/formatters.ts — keep the fork (for now)
**Decision**: Unlike the log fork, `webview/formatters.ts` genuinely produces different output:
- **Shared formatters**: Return plain strings (e.g., `stateColor` returns `"green"`)
- **CLI formatters**: Wrap in ANSI escape codes
- **VSCode formatters**: Wrap in CSS classes/variables and HTML

The pure math functions (`formatBytes`, `formatCpu`, `formatMemory`, `truncate`) are identical and should be imported from shared. The rendering functions (`stateColor`, `colorizeLogEntry`, `renderKvGrid`, etc.) are legitimately platform-specific.
**Strategy**: After D4 sub-path exports exist, replace the duplicated pure math formatters with imports from shared. Keep the HTML-specific rendering functions in `webview/formatters.ts`.

### D7: reconnect.ts — move into events/
**Decision**: `ReconnectScheduler` is only used by `EventWatcher`. Move from shared root to `shared/src/events/reconnect.ts` and re-export from the events module.

### D8: No import DAG enforcement script exists
**Decision**: `scripts/check-imports.mjs` referenced in the task does not exist. We need to create one. Document the required ALLOWED_DEPS rules here; implement the script in a future phase.

### D9: God file decomposition — deferred
**Decision**: The following files need decomposition but are deferred to Phase 2+:
- `DockerDashboardProvider.ts` (959 LOC) — split into message handler, webview lifecycle, Docker operations
- `webview/dashboard.ts` (776 LOC) — split into event router, panel manager, DOM controller
- `Dashboard.tsx` (533 LOC) — extract sub-components, reduce prop drilling
- `useKeyboardHandler.ts` (361 LOC) — split into panel-specific keyboard handlers
**Rationale**: These decompositions require careful UI testing and don't block the deduplication and module boundary work.

### D10: DockerService / DockerState convergence — deferred
**Decision**: `vscode/services/DockerService.ts` (476 LOC) and `cli/dashboard/DockerState.ts` (213 LOC) both implement event-driven Docker state management with nearly identical `handleContainerEvent()` logic. These should eventually share a common `DockerStateManager` in shared. Deferred because it requires abstracting the callback/rendering mechanism.

## Global State Migration Plan

| Global | Current Location | Strategy |
|--------|-----------------|----------|
| *None found* | — | No action needed |

**The codebase has excellent state hygiene.** Phase 0 discovery confirmed zero global or singleton mutable state. All state lives in class instances or function scopes.

Module-scoped `let` variables in `vscode/src/extension.ts` (lines 7-11: `dashboardProvider`, `watcherService`, etc.) are VSCode activation-scoped and follow standard VSCode extension patterns. No migration needed.

## Circular Dependency Resolution Plan

| Cycle | Strategy |
|-------|----------|
| *None found* | No action needed |

Phase 0 Madge analysis found **zero circular dependencies** across all three packages. The DAG is clean.

## Import DAG Enforcement Rules (for future check-imports script)

```javascript
// ALLOWED_DEPS — each module lists what it may import
const ALLOWED_DEPS = {
  // === Shared package sub-modules ===
  'shared/types':      [],                                    // leaf
  'shared/docker':     ['shared/types'],                      // + dockerode, zod
  'shared/compose':    ['shared/types'],                      // + zod
  'shared/log':        [],                                    // leaf (pure functions)
  'shared/events':     ['shared/docker', 'shared/types'],     // + reconnect (internal)
  'shared/stats':      ['shared/types'],
  'shared/core':       ['shared/types'],                      // formatters → types

  // === CLI package ===
  'cli/utils':         [],                                    // leaf
  'cli/formatters':    ['shared'],                            // re-exports shared formatters
  'cli/state':         ['shared'],                            // DockerState, stream managers
  'cli/panels':        ['cli/state', 'cli/formatters', 'shared'],
  'cli/ink':           ['cli/panels', 'cli/state', 'cli/formatters', 'shared'],
  'cli/commands':      ['cli/ink', 'cli/panels', 'cli/state', 'cli/formatters', 'cli/utils', 'shared'],

  // === VSCode package ===
  'vscode/utils':      [],                                    // leaf
  'vscode/types':      [],                                    // leaf (messages, schemas)
  'vscode/log':        ['vscode/types'],                      // or shared/log via sub-path
  'vscode/services':   ['shared', 'vscode/types'],
  'vscode/providers':  ['vscode/services', 'vscode/types', 'vscode/utils', 'shared'],
  'vscode/webview':    ['vscode/types', 'vscode/log'],        // separate bundle
  'vscode/extension':  ['vscode/providers', 'vscode/services', 'shared'],
};
```

## Complete File Mapping

Every file in `src/` maps to exactly one module. Test files (`.test.ts`) stay co-located with their source.

### shared/src/ → Modules 1-7

| Current Path | Module | Target Path | Notes |
|-------------|--------|-------------|-------|
| types/container.ts | types | (no move) | |
| types/image.ts | types | (no move) | |
| types/volume.ts | types | (no move) | |
| types/network.ts | types | (no move) | |
| types/compose.ts | types | (no move) | |
| types/events.ts | types | (no move) | |
| types/index.ts | types | (no move) | |
| docker/DockerClient.ts | docker | (no move) | |
| docker/DockerClient.test.ts | docker | (no move) | |
| docker/schemas.ts | docker | (no move) | |
| compose/ComposeClient.ts | compose | (no move) | |
| compose/ComposeDetector.ts | compose | (no move) | |
| compose/ComposeDetector.test.ts | compose | (no move) | |
| compose/ComposeFileReader.ts | compose | (no move) | |
| compose/schemas.ts | compose | (no move) | |
| log/LogTokenizer.ts | log | (no move) | |
| log/LogTokenizer.test.ts | log | (no move) | |
| log/LogFilter.ts | log | (no move) | |
| log/LogFilter.test.ts | log | (no move) | |
| log/LogParser.ts | log | (no move) | |
| log/LogParser.test.ts | log | (no move) | |
| log/LogAnalytics.ts | log | (no move) | |
| log/LogAnalytics.test.ts | log | (no move) | |
| log/LogTemplateEngine.ts | log | (no move) | |
| log/LogTemplateEngine.test.ts | log | (no move) | |
| log/LogSeverityTimeSeries.ts | log | (no move) | |
| log/LogSeverityTimeSeries.test.ts | log | (no move) | |
| log/index.ts | log | (no move) | |
| events/EventWatcher.ts | events | (no move) | |
| events/EventWatcher.test.ts | events | (no move) | |
| reconnect.ts | events | → events/reconnect.ts | Move: only consumer is EventWatcher |
| stats/StatsCollector.ts | stats | (no move) | |
| stats/StatsCollector.test.ts | stats | (no move) | |
| formatters.ts | core | (no move) | |
| branding.ts | core | (no move) | |
| phrases.ts | core | (no move) | |
| errors.ts | core | (no move) | |
| index.ts | core | (no move) | Barrel re-export |

### cli/src/ → Module 8

| Current Path | Module | Target Path | Notes |
|-------------|--------|-------------|-------|
| cli.ts | cli/commands | (no move) | |
| commands/dashboard.ts | cli/commands | (no move) | |
| commands/logs.ts | cli/commands | (no move) | |
| commands/ps.ts | cli/commands | (no move) | |
| formatters.ts | cli/formatters | (no move) | |
| formatters.test.ts | cli/formatters | (no move) | |
| utils/clipboard.ts | cli/utils | (no move) | |
| dashboard/DockerState.ts | cli/state | (no move) | |
| dashboard/DockerState.test.ts | cli/state | (no move) | |
| dashboard/LogStreamManager.ts | cli/state | (no move) | |
| dashboard/LogStreamManager.test.ts | cli/state | (no move) | |
| dashboard/StatsStreamManager.ts | cli/state | (no move) | |
| dashboard/StatsStreamManager.test.ts | cli/state | (no move) | |
| dashboard/ComposeLogStreamManager.ts | cli/state | (no move) | |
| dashboard/ExecManager.ts | cli/state | (no move) | |
| dashboard/branding.ts | cli/state | **DELETE** | Duplicate of shared — use `import from 'sidekick-docker-shared'` |
| dashboard/phrases.ts | cli/state | **DELETE** | Duplicate of shared — use `import from 'sidekick-docker-shared'` |
| dashboard/panels/types.ts | cli/panels | (no move) | |
| dashboard/panels/ContainersPanel.ts | cli/panels | (no move) | |
| dashboard/panels/ServicesPanel.ts | cli/panels | (no move) | |
| dashboard/panels/ImagesPanel.ts | cli/panels | (no move) | |
| dashboard/panels/VolumesPanel.ts | cli/panels | (no move) | |
| dashboard/panels/NetworksPanel.ts | cli/panels | (no move) | |
| dashboard/ink/Dashboard.tsx | cli/ink | (no move) | Future: decompose |
| dashboard/ink/dashboardTypes.ts | cli/ink | (no move) | |
| dashboard/ink/useKeyboardHandler.ts | cli/ink | (no move) | Future: decompose |
| dashboard/ink/useMouseHandler.ts | cli/ink | (no move) | |
| dashboard/ink/useTerminalSize.ts | cli/ink | (no move) | |
| dashboard/ink/useWindowedScroll.ts | cli/ink | (no move) | |
| dashboard/ink/ConfirmOverlay.tsx | cli/ink | (no move) | |
| dashboard/ink/ContextMenuOverlay.tsx | cli/ink | (no move) | |
| dashboard/ink/DetailPane.tsx | cli/ink | (no move) | |
| dashboard/ink/DetailTabBar.tsx | cli/ink | (no move) | |
| dashboard/ink/ExecOverlay.tsx | cli/ink | (no move) | |
| dashboard/ink/FilterOverlay.tsx | cli/ink | (no move) | |
| dashboard/ink/HelpOverlay.tsx | cli/ink | (no move) | |
| dashboard/ink/LogFilterOverlay.tsx | cli/ink | (no move) | |
| dashboard/ink/SideList.tsx | cli/ink | (no move) | |
| dashboard/ink/SortOverlay.tsx | cli/ink | (no move) | |
| dashboard/ink/StatusBar.tsx | cli/ink | (no move) | |
| dashboard/ink/TabBar.tsx | cli/ink | (no move) | |
| dashboard/ink/ToastNotification.tsx | cli/ink | (no move) | |
| dashboard/ink/TooSmallOverlay.tsx | cli/ink | (no move) | |
| dashboard/ink/VersionOverlay.tsx | cli/ink | (no move) | |
| dashboard/ink/mouse/MouseProvider.tsx | cli/ink | (no move) | |
| dashboard/ink/mouse/index.ts | cli/ink | (no move) | |
| dashboard/ink/mouse/mouseProtocol.ts | cli/ink | (no move) | |
| dashboard/ink/mouse/parseMouseEvent.ts | cli/ink | (no move) | |
| dashboard/ink/mouse/parseMouseEvent.test.ts | cli/ink | (no move) | |

### vscode/src/ → Module 9

| Current Path | Module | Target Path | Notes |
|-------------|--------|-------------|-------|
| extension.ts | vscode/extension | (no move) | |
| providers/DockerDashboardProvider.ts | vscode/providers | (no move) | Future: decompose |
| providers/ContainerTreeProvider.ts | vscode/providers | (no move) | |
| services/DockerService.ts | vscode/services | (no move) | |
| services/ContainerWatcherService.ts | vscode/services | (no move) | |
| types/messages.ts | vscode/types | (no move) | |
| types/messageSchemas.ts | vscode/types | (no move) | |
| types/log.ts | vscode/types | **DELETE** | After sub-path exports: import from shared |
| log/LogTokenizer.ts | vscode/log | **DELETE** | After sub-path exports: import from shared/log |
| log/LogFilter.ts | vscode/log | **DELETE** | After sub-path exports: import from shared/log |
| log/LogTemplateEngine.ts | vscode/log | **DELETE** | After sub-path exports: import from shared/log |
| log/LogAnalytics.ts | vscode/log | **DELETE** | After sub-path exports: import from shared/log |
| utils/nonce.ts | vscode/utils | (no move) | |
| webview/dashboard.ts | vscode/webview | (no move) | Future: decompose |
| webview/state.ts | vscode/webview | (no move) | |
| webview/formatters.ts | vscode/webview | (no move) | Replace pure math dupes with shared imports |
| webview/panels/types.ts | vscode/webview | (no move) | |
| webview/panels/containers.ts | vscode/webview | (no move) | |
| webview/panels/services.ts | vscode/webview | (no move) | |
| webview/panels/images.ts | vscode/webview | (no move) | |
| webview/panels/volumes.ts | vscode/webview | (no move) | |
| webview/panels/networks.ts | vscode/webview | (no move) | |

### Summary of Changes

| Action | Files | LOC Impact |
|--------|-------|-----------|
| DELETE cli/dashboard/phrases.ts | 1 | -738 |
| DELETE cli/dashboard/branding.ts | 1 | -2 |
| MOVE shared/reconnect.ts → shared/events/reconnect.ts | 1 | 0 |
| DELETE vscode/log/* (4 files, after sub-path exports) | 4 | ~-237 |
| DELETE vscode/types/log.ts (after sub-path exports) | 1 | -53 |
| Deduplicate formatters in vscode/webview/formatters.ts | 1 | ~-30 |
| **Total** | **9** | **~-1060** |

## Phased Execution Plan

### Phase 2: Quick Wins (Dedup)
1. Delete `cli/dashboard/phrases.ts`, update imports
2. Delete `cli/dashboard/branding.ts`, update imports
3. Move `shared/reconnect.ts` → `shared/events/reconnect.ts`, update imports

### Phase 3: Sub-Path Exports
1. Add `"exports"` field to shared `package.json`
2. Consolidate VSCode log/ fork → import from `sidekick-docker-shared/log`
3. Delete `vscode/types/log.ts`, import from shared
4. Replace pure math formatter duplicates in VSCode webview

### Phase 4: Import DAG Enforcement
1. Create `scripts/check-imports.mjs` with ALLOWED_DEPS rules
2. Add to CI pipeline
3. Fix any violations discovered

### Phase 5+: God File Decomposition
1. DockerDashboardProvider.ts (959 LOC)
2. webview/dashboard.ts (776 LOC)
3. Dashboard.tsx (533 LOC)
4. useKeyboardHandler.ts (361 LOC)
5. DockerService / DockerState convergence
