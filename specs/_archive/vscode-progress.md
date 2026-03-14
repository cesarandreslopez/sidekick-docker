# vscode — Extraction Progress Tracker

## Status: DONE

## Migration Table

| What | From | To | Status |
|------|------|----|--------|
| LogTokenizer.ts | vscode/src/log/LogTokenizer.ts | DELETED → sidekick-docker-shared/log | Done |
| LogFilter.ts | vscode/src/log/LogFilter.ts | DELETED → sidekick-docker-shared/log | Done |
| LogAnalytics.ts | vscode/src/log/LogAnalytics.ts | DELETED → sidekick-docker-shared/log | Done |
| LogTemplateEngine.ts | vscode/src/log/LogTemplateEngine.ts | DELETED → sidekick-docker-shared/log | Done |
| types/log.ts | vscode/src/types/log.ts | DELETED → sidekick-docker-shared/log | Done |
| formatBytes | webview/formatters.ts (local) | Re-exported from shared/formatters | Done |
| formatCpu | webview/formatters.ts (local) | Re-exported from shared/formatters | Done |
| formatMemory | webview/formatters.ts (local) | Re-exported from shared/formatters | Done |
| truncate | webview/formatters.ts (local) | Re-exported from shared/formatters | Done |

## Post-Extraction Checklist

- [x] All webview imports use sidekick-docker-shared/log sub-path
- [x] Pure math formatters imported from sidekick-docker-shared/formatters
- [x] VSCode-specific formatters (stateColor, stateIcon, formatPorts) kept local
- [x] tsc --noEmit passes
- [x] esbuild webview bundle builds clean
- [x] Import linter passes
- [x] No new circular deps
- [x] Full test suite passes (157/157)

## Notes & Decisions

- Sub-path exports (`./log`, `./formatters`) added to shared package.json with `typesVersions` for `moduleResolution: "node"` compatibility
- formatPorts kept local due to different type signature (`protocol: string` vs `protocol: 'tcp' | 'udp'`)
- stateIcon kept local due to different parameter type (`string` vs union type)
- stateColor stays local — returns CSS variables instead of semantic color names
- The vscode/log/ directory and module entry removed from check-imports.mjs
- Net deletion: ~290 lines of forked/duplicated code + 21 lines of formatter duplication
