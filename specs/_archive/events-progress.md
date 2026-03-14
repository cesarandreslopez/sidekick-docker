# events — Extraction Progress Tracker

## Status: DONE

## Migration Table

| What | From | To | Status |
|------|------|----|--------|
| reconnect.ts | shared/src/reconnect.ts | shared/src/events/reconnect.ts | Done |
| Re-export shim | — | shared/src/reconnect.ts (deprecated shim) | Done |
| EventWatcher import update | ../reconnect | ./reconnect | Done |
| events/index.ts barrel | — | Added ReconnectScheduler exports | Done |
| shared/index.ts barrel | ./reconnect | ./events/reconnect | Done |

## Post-Extraction Checklist

- [x] index.ts exports match design.md
- [x] Re-export shim in place at old location
- [x] All consumers updated (EventWatcher, shared barrel)
- [x] tsc --noEmit passes
- [x] Unit tests pass (88 shared, 69 CLI)
- [x] Import linter passes
- [x] No new circular deps
- [x] Full test suite passes (157/157)

## Notes & Decisions

- ReconnectScheduler moved from shared root to events/ since EventWatcher is its only consumer
- check-imports.mjs transitional allowance for shared/events → shared/core removed
