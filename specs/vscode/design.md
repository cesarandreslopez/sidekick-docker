# vscode — Design Spec

## Purpose
VSCode extension providing a webview-based Docker dashboard, container tree view, status bar indicator, and quick-pick container commands. Two separate bundles: extension (Node.js CJS) and webview (browser IIFE).

## Public Interface

This is a top-level consumer package — it has no public API for other packages.

VSCode activation entry: `extension.ts`

**Contributed commands:**
- `sidekick-docker.openDashboard` — Open webview dashboard
- `sidekick-docker.openContainerInDashboard` — Open dashboard focused on a container
- `sidekick-docker.refreshContainers` — Force refresh container list
- `sidekick-docker.startContainer` / `stopContainer` — Tree view actions
- `sidekick-docker.quickStart` / `quickStop` / `quickRestart` — Quick pick commands

## Internal Structure

```
sidekick-docker-vscode/src/
├── extension.ts                    # VSCode activation, command registration
├── providers/
│   ├── DockerDashboardProvider.ts  # Webview lifecycle + message handling (959 LOC — future decompose)
│   └── ContainerTreeProvider.ts    # Tree view data provider
├── services/
│   ├── DockerService.ts            # Webview-bound Docker ops + state (476 LOC)
│   └── ContainerWatcherService.ts  # Always-on container polling + event watching
├── types/
│   ├── messages.ts                 # Extension ↔ webview message types
│   ├── messageSchemas.ts          # Zod validation for webview messages
│   └── log.ts                      # DUPLICATE — log types (to be deleted)
├── log/                            # FORK — to be consolidated with shared/log
│   ├── LogTokenizer.ts
│   ├── LogFilter.ts
│   ├── LogTemplateEngine.ts
│   └── LogAnalytics.ts
├── utils/
│   └── nonce.ts                    # CSP nonce generator for webview
└── webview/                        # Browser-side code (separate IIFE bundle)
    ├── dashboard.ts                # Webview entry point (776 LOC — future decompose)
    ├── state.ts                    # WebviewState management
    ├── formatters.ts               # HTML/CSS formatters (partially duplicated from shared)
    └── panels/
        ├── types.ts                # WebviewPanel interface
        ├── containers.ts           # Container panel rendering
        ├── services.ts             # Compose services panel
        ├── images.ts               # Images panel
        ├── volumes.ts              # Volumes panel
        └── networks.ts             # Networks panel
```

### Internal Sub-module DAG

**Extension bundle (Node.js CJS):**
```
shared (external)
  │
  ├──► utils/nonce          (leaf)
  ├──► types/               (messages, schemas — leaf)
  ├──► services/            (depends on shared, types)
  │         │
  │         ▼
  ├──► providers/           (depends on services, types, utils, shared)
  │         │
  │         ▼
  └──► extension.ts         (depends on providers, services, shared)
```

**Webview bundle (browser IIFE) — separate from extension:**
```
types/          (messages — shared via postMessage protocol)
  │
  ├──► log/                 (currently local fork, target: shared/log via sub-path)
  │
  ├──► webview/state        (depends on types, log)
  │         │
  │         ▼
  ├──► webview/formatters   (depends on types, log)
  │         │
  │         ▼
  ├──► webview/panels/*     (depends on types, state, formatters)
  │         │
  │         ▼
  └──► webview/dashboard.ts (depends on panels, state, types, log)
```

## Dependencies

- **Extension bundle allowed imports**: `sidekick-docker-shared` (all modules), `vscode` API, `zod`
- **Webview bundle allowed imports**: `vscode/types/messages`, `vscode/log/` (or shared/log via sub-path), `vscode/webview/` internal
- **Forbidden imports**: `sidekick-docker-cli` — VSCode must never depend on the CLI package
- **Webview forbidden imports**: `vscode` API, `dockerode`, `node:*` — webview runs in browser context

## Files to Move / Delete

| Source (current) | Destination (target) | Notes |
|-----------------|---------------------|-------|
| types/log.ts | **DELETE** | Duplicate type defs. After sub-path exports: `import type { ... } from 'sidekick-docker-shared/log'` |
| log/LogTokenizer.ts | **DELETE** | Fork of shared. After sub-path exports: `import from 'sidekick-docker-shared/log'` |
| log/LogFilter.ts | **DELETE** | Fork of shared. After sub-path exports. |
| log/LogTemplateEngine.ts | **DELETE** | Fork of shared. After sub-path exports. |
| log/LogAnalytics.ts | **DELETE** | Fork of shared. After sub-path exports. |

### Consolidation plan:

**Step 1: Add sub-path exports to shared/package.json**
```json
{
  "exports": {
    ".": "./dist/index.js",
    "./log": "./dist/log/index.js",
    "./formatters": "./dist/formatters.js"
  }
}
```

**Step 2: Update VSCode webview esbuild config**
- Add `sidekick-docker-shared/log` and `sidekick-docker-shared/formatters` as resolvable (not external)
- Ensure esbuild bundles only the specific sub-path, not the full shared barrel

**Step 3: Update webview imports**
- `import { tokenizeLogLine } from '../log/LogTokenizer'` → `import { tokenizeLogLine } from 'sidekick-docker-shared/log'`
- `import type { LogTokenType, FilterMatch } from '../types/log'` → `import type { ... } from 'sidekick-docker-shared/log'`
- Replace duplicated `formatBytes`, `formatCpu`, etc. in `webview/formatters.ts` with `import from 'sidekick-docker-shared/formatters'`

**Step 4: Delete forked files**
- Delete `vscode/src/log/` directory (4 files)
- Delete `vscode/src/types/log.ts`

**Step 5: Verify**
- `npx tsc --noEmit` in vscode package
- Build webview bundle and verify it works in browser context
- No `require('dockerode')` or other Node modules in webview bundle

### Formatters consolidation (webview/formatters.ts):

The following functions are identical to shared and should be replaced with imports:
- `formatBytes()` — identical to shared
- `formatCpu()` — identical to shared
- `formatMemory()` — identical to shared
- `formatPorts()` — similar (slightly different type annotation, functionally identical)
- `stateIcon()` — identical to shared (uses `string` instead of union type — compatible)
- `truncate()` — identical to shared

The following functions are genuinely VSCode-specific and stay:
- `stateColor()` — returns CSS variables instead of color names
- `escapeHtml()` — HTML-specific
- `colorizeLogEntry()` — produces HTML spans instead of ANSI
- `colorizeState()`, `colorizeHealth()`, `colorizeBool()`, `colorizeId()` — HTML output
- `renderKvGrid()`, `renderEnvGrid()` — HTML grid rendering
- `colorizeNetworkContainer()` — HTML output
- `renderSparkline()` — HTML sparkline
- `highlightMatchesHtml()` — HTML highlight marks

## Open Questions

- **DockerDashboardProvider.ts decomposition (959 LOC)**: This god class handles webview lifecycle, HTML generation, message routing, and Docker action dispatch. Future split: (a) `DashboardHtmlBuilder` for webview HTML generation, (b) `DashboardMessageRouter` for message handling, (c) `DockerDashboardProvider` slim wrapper for webview lifecycle.
- **webview/dashboard.ts decomposition (776 LOC)**: Monolithic webview entry handling DOM manipulation, event handling, panel routing, and state updates. Future split: (a) `DashboardController` for top-level orchestration, (b) `PanelRouter` for panel switching, (c) `EventBus` for message handling.
- **DockerService (476 LOC)**: Contains state management logic nearly identical to CLI's DockerState (handleContainerEvent, refresh, compose detection). A shared `DockerStateManager` could be extracted to the shared package in a future phase.
