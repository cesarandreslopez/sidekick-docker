# compose — Design Spec

## Purpose
Docker Compose operations via `docker compose` CLI subprocess. Handles project detection from container labels, compose file reading, and compose lifecycle commands (up, down, restart, stop, logs).

## Public Interface

Exports from `sidekick-docker-shared/src/compose/`:

- `ComposeClient` — Executes `docker compose` CLI commands
  - `up(project, cwd?)`, `down(project, cwd?)`, `restart(project, service?, cwd?)`, `stop(project, service?, cwd?)`, `start(project, service?, cwd?)`
  - Lifecycle `cwd` accepts a string or `ComposeCommandOptions` with optional `cwd` and ordered `configFiles`
  - `streamLogs(project, service?, tail?, signal?)` — AsyncIterable<LogEntry>; cancellation stops the process, split UTF-8 and final lines are preserved, and failures throw
- `ComposeExecResult` — Result type for CLI execution
- `ComposeError`, `throwIfComposeFailed` — Surface nonzero lifecycle exits
- `resolveComposeOptions(source, fallback?)` — Resolves recorded files in override order and rejects missing paths; `resolveComposeCwd` remains available
- `ComposeDetector` — Detects compose projects from container labels + file config
  - `detect(containers, fileConfig?)` → ComposeProject[]
  - Preserves ordered configuration files and aggregates replicas per service, retaining a deterministic representative container and running/total counts
- `ComposeFileReader` — Reads and parses docker-compose.yml files
  - `readFromDirectory(cwd)` → ComposeFileConfig | null
- `ComposeFileConfig` — Parsed compose file structure
- `ComposeFileServiceConfig` — Per-service compose file config

## Internal Structure

```
sidekick-docker-shared/src/compose/
├── ComposeClient.ts          # CLI executor + log streaming
├── ComposeDetector.ts        # Label-based + file-based project detection
├── ComposeDetector.test.ts   # Tests
├── ComposeFileReader.ts      # YAML file reading + parsing
├── composeCwd.ts             # Project directories and ordered configuration files
└── schemas.ts                # Zod schemas for compose config
```

## Dependencies

- **Allowed imports**: `types` (internal), `zod` (external)
- **Forbidden imports**: `docker`, `log`, `events`, `stats`, `core` — compose module talks to Docker via CLI subprocess, not DockerClient

## Files to Move

| Source (current) | Destination (target) | Notes |
|-----------------|---------------------|-------|
| (all files stay in place) | — | No moves needed |

## Open Questions

- None — this module is already well-structured.
