# Feature: [Name]

## Module Placement

Which module(s) does this feature belong in?

| Module | Change Type | Rationale |
|--------|------------|-----------|
| | new file / modify existing | |

If this touches multiple modules, list each separately.

## Public API Changes

New exports, modified signatures, or deprecated symbols:

```typescript
// Example:
export function newFunction(arg: SomeType): ReturnType;
```

## Dependency Check

- [ ] Does this introduce new inter-module dependencies? If yes, verify they follow the DAG (arrows flow down from leaves to consumers)
- [ ] Does this add new external dependencies? If yes, justify why
- [ ] Run `node scripts/check-imports.mjs` to verify DAG compliance

## Implementation Plan

- [ ] Write/update types in `shared/src/types/` (if needed)
- [ ] Implement core logic in the appropriate shared module
- [ ] Export from module barrel `index.ts`
- [ ] Export from main barrel `shared/src/index.ts` (if public)
- [ ] Add sub-path export in `package.json` (if needed for tree-shaking)
- [ ] Update CLI consumer(s)
- [ ] Update VSCode consumer(s)
- [ ] Add tests (co-located `.test.ts`)

## Quality Gates

Before merging:

```bash
npx tsc --noEmit                          # all 3 packages
npm test                                  # vitest
node scripts/check-imports.mjs            # import DAG
npx madge --circular --extensions ts,tsx src/  # no cycles
```

- [ ] No new `any` types
- [ ] PR under ~300 lines changed (excluding tests)
