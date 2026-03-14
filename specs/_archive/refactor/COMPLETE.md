# Modular TypeScript Refactoring — Complete

Date: 2026-03-14

## What Was Refactored and Why

The sidekick-docker monorepo (3 packages: shared, CLI, VSCode) had accumulated cross-package duplication and lacked explicit module boundaries. The refactoring:

1. **Eliminated all cross-package duplication** (~1,050 LOC removed)
2. **Added explicit public APIs** via barrel `index.ts` files for every sub-module
3. **Defined and enforced** a strict import dependency DAG
4. **Added sub-path exports** for tree-shaking (log, formatters)
5. **Tightened TypeScript strictness** across all packages

## Final Module Structure

```
sidekick-docker-shared/src/
├── types/          (leaf — pure type definitions)
├── docker/         (Docker Engine API facade)
├── compose/        (Docker Compose CLI operations)
├── log/            (log analysis — pure functions, leaf)
├── events/         (event streaming + reconnect logic)
├── stats/          (stats collection with ring buffer)
├── formatters.ts   (formatting utilities)
├── branding.ts     (brand constants)
├── phrases.ts      (random phrases)
├── errors.ts       (error helpers)
└── index.ts        (barrel re-export)

sidekick-docker-cli/src/     → imports from shared
sidekick-docker-vscode/src/  → imports from shared + shared/log + shared/formatters
```

Each sub-module has a barrel `index.ts` defining its public API. The dependency DAG is enforced by `scripts/check-imports.mjs`.

## Key Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Keep 3-package monorepo | Each package has distinct bundling requirements |
| D2-D3 | Delete CLI phrases.ts + branding.ts | Byte-for-byte duplicates of shared |
| D4 | Consolidate VSCode log/ fork via sub-path exports | Shared log module is pure functions — no Node deps |
| D5 | Delete VSCode types/log.ts | Duplicate type definitions |
| D6 | Keep VSCode webview/formatters.ts (partially) | HTML/CSS rendering is genuinely different; pure math functions imported from shared |
| D7 | Move reconnect.ts into events/ | Only consumer is EventWatcher |
| D9 | Defer god file decomposition | Requires careful UI testing; doesn't block module boundary work |

Full decision log: `specs/_archive/refactor/architecture.md`

## Metrics — Before vs After

| Metric | Before (Phase 0) | After (Phase 5) | Delta |
|--------|-------------------|------------------|-------|
| Total files | 109 | 107 | -2 |
| Total LOC | 13,179 | ~12,150 | **-1,029 (-7.8%)** |
| CLI LOC | 5,618 | 4,878 | **-740** |
| VSCode LOC | 3,981 | 3,673 | **-308** |
| Circular deps | 0 | 0 | 0 |
| `any` usage | 0 | 0 | 0 |
| Tests | 157 | 169 | +12 |
| Test pass rate | 100% | 100% | — |
| Sub-path exports | 0 | 2 | +2 |
| Barrel index files | 2 | 7 | +5 |
| TS strict options | 3 | 6 | +3 |

## Commits (14 total)

### Phase 2: Infrastructure & Safety Net
- Import DAG enforcement script (`check-imports.mjs`)

### Phase 3: Extract Modules
- `9cc5b77` Move reconnect.ts into events/ module
- `6b6dc4a` Delete duplicate phrases.ts and branding.ts from CLI
- `2789e83` Add sub-path exports to shared package.json
- `4a50b5e` Consolidate VSCode log/ fork with shared/log sub-path export
- `618245a` Deduplicate pure math formatters in VSCode webview
- `6e75d7d` Remove vscode/log module from import DAG linter

### Phase 4: Validate & Harden
- `4df0419` Add per-module progress trackers
- `adc8644` Add integration tests and validation report

### Phase 5: Cleanup & Finalize
- `becb2aa` Remove deprecated reconnect.ts re-export shim
- `0928031` Add barrel index.ts files for compose, docker, stats
- `610fa3c` Enable noImplicitReturns, noFallthroughCasesInSwitch, forceConsistentCasingInFileNames
- `62c2341` Update CLAUDE.md with final modular architecture
- `3db691c` Add new-feature template
- `5af8a3a` Archive refactoring specs

## Remaining Technical Debt

| Item | Priority | Notes |
|------|----------|-------|
| God file: `DockerDashboardProvider.ts` (959 LOC) | Medium | Split into message handler, webview lifecycle, Docker ops |
| God file: `webview/dashboard.ts` (776 LOC) | Medium | Split into event router, panel manager, DOM controller |
| God file: `Dashboard.tsx` (533 LOC) | Medium | Extract sub-components, reduce prop drilling |
| `noUncheckedIndexedAccess` | Low | 50+ errors to fix across all packages |
| VSCode package tests | Medium | Zero test coverage |
| DockerService/DockerState convergence | Low | Extract shared `DockerStateManager` |

## Final Gate Check

All checks pass:

```
✅ tsc --noEmit (shared, cli, vscode)
✅ vitest (169/169 tests)
✅ Import DAG: no violations
✅ Circular deps: none
✅ any usage: 0
```
