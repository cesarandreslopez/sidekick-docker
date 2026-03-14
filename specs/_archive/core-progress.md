# core — Extraction Progress Tracker

## Status: DONE

## Migration Table

| What | From | To | Status |
|------|------|----|--------|
| Sub-path export: formatters | — | shared package.json `./formatters` | Done |
| Sub-path export: log | — | shared package.json `./log` | Done |
| typesVersions | — | shared package.json (for moduleResolution: node) | Done |

## Post-Extraction Checklist

- [x] exports field in package.json matches design.md
- [x] typesVersions field enables TS resolution with moduleResolution: "node"
- [x] tsc --noEmit passes in all 3 packages
- [x] Node resolution works (`require.resolve('sidekick-docker-shared/log')`)
- [x] esbuild bundles resolve sub-path imports correctly
- [x] Full test suite passes (157/157)

## Notes & Decisions

- Sub-path exports: `.` (barrel), `./log` (pure log analysis), `./formatters` (pure formatters)
- All sub-path targets are platform-agnostic (no Node.js deps) — safe for browser bundles
