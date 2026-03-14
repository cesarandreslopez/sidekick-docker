# Compatibility Re-Export Pattern

When moving a file from its old location to a new one, leave a re-export shim
at the old path so existing consumers keep working until they are updated.

## Template

```typescript
/**
 * @deprecated Import from 'sidekick-docker-shared/events/reconnect' instead.
 * This re-export will be removed in a future release.
 */
export { ReconnectScheduler, INITIAL_RECONNECT_DELAY, MAX_RECONNECT_DELAY, MAX_RECONNECT_ATTEMPTS } from './events/reconnect';
```

## Rules

1. **Use `@deprecated` JSDoc on every re-export** so editors flag old imports.
2. **Use explicit named re-exports** — never `export *`. This keeps the public
   API surface visible and prevents accidental leakage of internal symbols.
3. **One re-export per moved symbol** — group them in a single file at the old
   path if the entire file moved.
4. **Runtime deprecation warning (optional)** — for high-visibility moves in
   dev mode, wrap the re-export in a function that logs a warning:

   ```typescript
   import { ReconnectScheduler as _ReconnectScheduler } from './events/reconnect';

   /** @deprecated Import from './events/reconnect' instead. */
   export const ReconnectScheduler = (() => {
     if (process.env.NODE_ENV !== 'production') {
       console.warn(
         '[sidekick-docker] ReconnectScheduler has moved to events/reconnect. ' +
         'Update your import to suppress this warning.'
       );
     }
     return _ReconnectScheduler;
   })();
   ```

   **Skip this for type-only re-exports** (they have no runtime presence).

5. **Track in a removal checklist** — add an entry to
   `specs/refactor/infrastructure-notes.md` so the shim gets cleaned up once
   all consumers are updated.

## Lifecycle

```
Phase N:   Move file to new location + leave re-export shim at old path
Phase N:   Update consumers in the same PR (if < 300 LOC change)
Phase N+1: Update remaining consumers
Phase N+2: Delete the re-export shim (verify no imports remain with `grep`)
```

## Verification

Before deleting a re-export shim, confirm zero remaining references:

```bash
# Check for imports from the old path
grep -rn "from ['\"].*old/path" sidekick-docker-shared/src/ sidekick-docker-cli/src/ sidekick-docker-vscode/src/
```
