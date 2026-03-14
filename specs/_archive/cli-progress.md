# cli — Extraction Progress Tracker

## Status: DONE

## Migration Table

| What | From | To | Status |
|------|------|----|--------|
| phrases.ts (738 LOC) | cli/src/dashboard/phrases.ts | DELETED (dead code) | Done |
| branding.ts (2 LOC) | cli/src/dashboard/branding.ts | DELETED (dead code) | Done |

## Post-Extraction Checklist

- [x] CLI already imports getRandomPhrase, BRAND_INLINE, BRAND_TAGLINE from shared
- [x] No remaining imports reference deleted files
- [x] tsc --noEmit passes
- [x] Unit tests pass (69 CLI tests)
- [x] Import linter passes
- [x] No new circular deps
- [x] Full test suite passes (157/157)

## Notes & Decisions

- Both files were dead code — CLI was already importing from sidekick-docker-shared
- No re-export shims needed since no code referenced the local copies
- Net deletion: 740 lines of duplicated code
