# compose — Design Spec

## Purpose
Docker Compose operations via `docker compose` CLI subprocess. Handles project detection from container labels, compose file reading, and compose lifecycle commands (up, down, restart, stop, logs).

## Public Interface

Exports from `sidekick-docker-shared/src/compose/`:

- `ComposeClient` — Executes `docker compose` CLI commands
  - `up(project, cwd)`, `down(project, cwd)`, `restart(project, service?, cwd)`, `stop(project, service?, cwd)`
  - `streamLogs(project, service?)` — AsyncIterable<LogEntry>
- `ComposeExecResult` — Result type for CLI execution
- `ComposeDetector` — Detects compose projects from container labels + file config
  - `detect(containers, fileConfig?)` → ComposeProject[]
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
