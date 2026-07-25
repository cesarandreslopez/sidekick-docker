# cli — Design Spec

## Purpose
Terminal UI dashboard for Docker management using Ink 7 + React 19. Provides an interactive TUI with panel-based navigation, real-time stats, log streaming, and Docker operations.

## Public Interface

This is a top-level consumer package — it has no public API for other packages.

Entry points:
- `cli.ts` — Commander.js CLI setup, parses args and dispatches to commands
- `commands/dashboard.ts` — Main TUI dashboard (default command)
- `commands/ps.ts` — Container list (non-interactive)
- `commands/logs.ts` — Container log streaming (non-interactive)

## Internal Structure

```
sidekick-docker-cli/src/
├── cli.ts                          # Commander.js entry point
├── commands/
│   ├── dashboard.ts                # TUI wiring: creates all managers, panels, renders Dashboard
│   ├── ps.ts                       # Non-interactive container list
│   └── logs.ts                     # Non-interactive log streaming
├── formatters.ts                   # CLI-specific ANSI formatters (re-exports shared pure fmts)
├── formatters.test.ts
├── utils/
│   └── clipboard.ts                # pbcopy/xclip wrapper
└── dashboard/
    ├── DockerState.ts              # Domain state: containers, images, volumes, etc.
    ├── DockerState.test.ts
    ├── LogStreamManager.ts         # Selection-driven log streaming
    ├── LogStreamManager.test.ts
    ├── StatsStreamManager.ts       # Selection-driven stats streaming
    ├── StatsStreamManager.test.ts
    ├── ComposeLogStreamManager.ts  # Compose service log streaming
    ├── ExecManager.ts              # Container exec via node-pty
    ├── panels/
    │   ├── types.ts                # SidePanel, PanelItem, PanelAction, DetailTab interfaces
    │   ├── ContainersPanel.ts      # Container panel implementation
    │   ├── ServicesPanel.ts        # Compose services panel
    │   ├── ImagesPanel.ts          # Images panel
    │   ├── VolumesPanel.ts         # Volumes panel
    │   └── NetworksPanel.ts        # Networks panel
    └── ink/
        ├── Dashboard.tsx           # Main React component (533 LOC — future decompose target)
        ├── dashboardTypes.ts       # Dashboard-internal type definitions
        ├── useKeyboardHandler.ts   # All keyboard input handling (361 LOC — future decompose)
        ├── useMouseHandler.ts      # Mouse input handling
        ├── useTerminalSize.ts      # Terminal resize tracking
        ├── useWindowedScroll.ts    # Virtualized scroll for long lists
        ├── SideList.tsx            # Scrollable item list
        ├── DetailPane.tsx          # Right-side detail view
        ├── DetailTabBar.tsx        # Detail tab navigation
        ├── TabBar.tsx              # Top panel tabs
        ├── StatusBar.tsx           # Bottom status bar
        ├── ConfirmOverlay.tsx      # Confirmation modal
        ├── ContextMenuOverlay.tsx  # Right-click context menu
        ├── ExecOverlay.tsx         # Container exec terminal
        ├── FilterOverlay.tsx       # Item filter input
        ├── HelpOverlay.tsx         # Help screen
        ├── LogFilterOverlay.tsx    # Log filter input
        ├── SortOverlay.tsx         # Sort options
        ├── ToastNotification.tsx   # Toast messages
        ├── TooSmallOverlay.tsx     # Terminal too small warning
        ├── VersionOverlay.tsx      # Version info
        └── mouse/
            ├── MouseProvider.tsx   # React context for mouse events
            ├── mouseProtocol.ts    # Terminal mouse protocol enable/disable
            ├── parseMouseEvent.ts  # Mouse event parsing
            ├── parseMouseEvent.test.ts
            └── index.ts            # Barrel export
```

### Internal Sub-module DAG

```
shared (external)
  │
  ├──► utils/clipboard    (leaf)
  ├──► formatters         (re-exports shared + CLI-specific ANSI)
  ├──► dashboard/state    (DockerState, *StreamManager, ExecManager)
  │         │
  │         ▼
  ├──► dashboard/panels   (depends on state, formatters, shared)
  │         │
  │         ▼
  ├──► dashboard/ink      (depends on panels, state, formatters, shared)
  │         │
  │         ▼
  └──► commands           (depends on ink, panels, state, utils, shared)
```

## Dependencies

- **Allowed imports**: `sidekick-docker-shared` (all modules)
- **Allowed external**: `commander`, `ink`, `react`, `node-pty` (optional)
- **Forbidden imports**: `sidekick-docker-vscode` — CLI must never depend on the VSCode package

## Files to Move / Delete

| Source (current) | Destination (target) | Notes |
|-----------------|---------------------|-------|
| dashboard/phrases.ts | **DELETE** | Byte-for-byte duplicate of shared/phrases.ts (738 LOC). Import `getRandomPhrase` from `sidekick-docker-shared` instead. |
| dashboard/branding.ts | **DELETE** | Subset of shared/branding.ts (2 LOC). Import `BRAND_INLINE`, `BRAND_TAGLINE` from `sidekick-docker-shared` instead. |

### Migration steps for phrases.ts deletion:
1. Find all imports of `./phrases` or `../phrases` within cli/src/
2. Replace with `import { getRandomPhrase } from 'sidekick-docker-shared'`
3. Delete `cli/src/dashboard/phrases.ts`
4. Run `npx tsc --noEmit` and `npx vitest run` to verify

### Migration steps for branding.ts deletion:
1. Find all imports of `./branding` or `../branding` within cli/src/
2. Replace with `import { BRAND_INLINE, BRAND_TAGLINE } from 'sidekick-docker-shared'`
3. Delete `cli/src/dashboard/branding.ts`
4. Run `npx tsc --noEmit` and `npx vitest run` to verify

## Open Questions

- **Dashboard.tsx decomposition**: The main component has 29 imports and handles state, rendering, keyboard, panels, and overlays. Future phase should extract: (a) panel content rendering, (b) overlay management, (c) layout structure as separate components.
- **useKeyboardHandler.ts decomposition**: 361 LOC handling all keyboard input. Could be split into panel-specific key handlers that each panel registers via its `getKeybindings()` method.
- **DockerState vs DockerService convergence**: CLI's DockerState and VSCode's DockerService both implement `handleContainerEvent()` with nearly identical logic. A shared `DockerStateManager` could be extracted to shared in a future phase.
