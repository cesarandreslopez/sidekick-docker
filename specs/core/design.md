# core — Design Spec

## Purpose
Cross-cutting shared utilities: data formatters, branding constants, joke phrases, error helpers, and the package barrel index. These are root-level files in the shared package that don't belong to a specific domain module.

## Public Interface

Exports from `sidekick-docker-shared/src/` (root-level files):

**Formatters** (`formatters.ts`):
- `formatBytes(bytes)` → string — Human-readable byte size ("1.5 GB")
- `formatCpu(percent)` → string — CPU percentage ("45.2%")
- `formatMemory(usage, limit)` → string — Memory with limit ("512 MB / 2 GB")
- `formatPorts(ports)` → string — Port bindings ("8080:80/tcp")
- `stateIcon(state)` → string — Unicode icon for container state
- `stateColor(state)` → string — Color name for container state
- `truncate(str, maxLen)` → string — Truncate with ellipsis

**Branding** (`branding.ts`):
- `BRAND_INLINE` — "⚡ SIDEKICK"
- `BRAND_TAGLINE` — "Docker"
- `BRAND_COLOR_HEX` — "#2B4C7E"
- `BRAND_COLOR_ANSI` — Truecolor ANSI escape
- `BRAND_COLOR_ANSI_RESET` — Reset escape

**Phrases** (`phrases.ts`):
- `getRandomPhrase()` → string — Random Docker joke/pun for loading screens

**Errors** (`errors.ts`):
- `errorMessage(err: unknown)` → string — Safe error message extraction

**Constants** (`index.ts`):
- `MAX_LOG_LINES` — 1000

## Internal Structure

```
sidekick-docker-shared/src/
├── formatters.ts    # Pure math + Docker-domain formatters
├── branding.ts      # Brand name, tagline, colors
├── phrases.ts       # 738-line joke/pun list
├── errors.ts        # errorMessage() helper
└── index.ts         # Barrel re-export of all modules
```

## Dependencies

- **Allowed imports**: `types` (formatters.ts uses PortBinding, ContainerInfo for type annotations)
- **Forbidden imports**: `docker`, `compose`, `log`, `events`, `stats`

## Files to Move

| Source (current) | Destination (target) | Notes |
|-----------------|---------------------|-------|
| (all files stay in place) | — | No moves needed |

## Sub-Path Export Plan

To allow VSCode's browser webview bundle to import pure math formatters without pulling in Node.js dependencies (via the barrel), add a sub-path export:

```json
"exports": {
  ".": "./dist/index.js",
  "./log": "./dist/log/index.js",
  "./formatters": "./dist/formatters.js"
}
```

This enables: `import { formatBytes, formatCpu } from 'sidekick-docker-shared/formatters'`

The pure math functions (`formatBytes`, `formatCpu`, `formatMemory`, `truncate`) have zero dependencies beyond `types` and are safe for browser bundles. The Docker-domain functions (`stateIcon`, `stateColor`, `formatPorts`) also have no Node deps and are equally safe.

## Open Questions

- Should `formatters.ts` be split into pure math (`formatBytes`, `formatCpu`, `truncate`) vs. Docker-domain (`stateIcon`, `stateColor`, `formatPorts`)? Not necessary now — all functions are pure and platform-agnostic. The split would only matter if stateColor needed to return platform-specific values (ANSI vs CSS), but currently it returns semantic color names like "green".
