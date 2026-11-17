# ComposeDetector & ComposeClient

## ComposeDetector

Discovers Compose projects from container labels. Optionally merges a compose file config (read separately, see [CachedComposeFileReader](#cachedcomposefilereader)) to include services with no container yet.

### Usage

```typescript
import { ComposeDetector, ComposeFileReader } from 'sidekick-docker-shared';

const detector = new ComposeDetector();
const containers = await client.listContainers();
const projects = detector.detect(containers);              // labels only
const fileConfig = await new ComposeFileReader().readFromDirectory(process.cwd());
const merged = detector.detect(containers, fileConfig);    // plus planned services
```

### Detection Methods

1. **Label-based** (primary) — reads `com.docker.compose.project` and `com.docker.compose.service` from container labels
2. **File-based** (secondary) — the optional `fileConfig` argument of `detect(containers, fileConfig?)`: the full service list that `ComposeFileReader` got from `docker compose config`. The detector itself spawns nothing

The detector merges both sources, so you see running containers and planned services in a single view.

### Return Type

Returns an array of `ComposeProject` objects, each containing:

- `name` — project name
- `services` — array of `ComposeService` objects with name, state, image, ports and a container ID (set whenever a container exists, preferring a running one)
- `workingDir`, `configFile`, `configFiles` — optional recorded project location and files in override order; `configFile` remains the first file for compatibility
- `status` — `running`, `partial`, or `stopped`, accounting for all discovered replicas

Services include optional `replicas`, `runningReplicas`, and `totalReplicas` fields. Each `ComposeReplica` records `containerId`, `state`, `image`, and `ports`. The service's existing `containerId` refers to a deterministic representative, preferring a running replica. Planned services have an empty replica list and zero counts.

## ComposeClient

Wraps `docker compose` CLI commands for project lifecycle management.

### Usage

```typescript
import { ComposeClient } from 'sidekick-docker-shared';

const compose = new ComposeClient();
await compose.up('my-project');
await compose.down('my-project');
await compose.restart('my-project', 'web');
```

### Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `up` | <code>(project: string, cwd?: string &#124; ComposeCommandOptions) =&gt; Promise&lt;ComposeExecResult&gt;</code> | Start a Compose project (`docker compose up -d`) |
| `down` | <code>(project: string, cwd?: string &#124; ComposeCommandOptions) =&gt; Promise&lt;ComposeExecResult&gt;</code> | Stop a Compose project (`docker compose down`) |
| `restart` | <code>(project: string, service?: string, cwd?: string &#124; ComposeCommandOptions) =&gt; Promise&lt;ComposeExecResult&gt;</code> | Restart a project or specific service |
| `stop` | <code>(project: string, service?: string, cwd?: string &#124; ComposeCommandOptions) =&gt; Promise&lt;ComposeExecResult&gt;</code> | Stop a project or specific service |
| `start` | <code>(project: string, service?: string, cwd?: string &#124; ComposeCommandOptions) =&gt; Promise&lt;ComposeExecResult&gt;</code> | Start existing service containers |
| `logs` | `(project: string, service?: string, tail?: number) => Promise<ComposeExecResult>` | One-shot `docker compose logs --tail` (default 100) |
| `ps` | `(project: string) => Promise<ComposeExecResult>` | `docker compose ps --format json` |
| `streamLogs` | `(project: string, service?: string, tail?: number, signal?: AbortSignal, since?: string) => AsyncIterable<LogEntry>` | Follow logs; default tail is 100; `since` (RFC 3339) resumes after a reconnect |

Lifecycle methods resolve to a `ComposeExecResult` (`exitCode`, `stdout`, `stderr`, and `cancelled: true` when the run was aborted); use `throwIfComposeFailed(result, operation)` to turn a nonzero exit into a `ComposeError` (whose `cancelled` flag lets callers report a cancel as such). String `cwd` arguments remain supported. `ComposeCommandOptions` accepts `{ cwd?, configFiles?, signal?, onOutput? }`: `configFiles` are passed with `-f` in the supplied order, `signal` cancels the run (SIGTERM, then SIGKILL), and `onOutput(text, stream)` receives output as it arrives.

Use `resolveComposeOptions(source, fallback?)` to resolve recorded paths and reject missing files before an action:

```typescript
import { ComposeClient, resolveComposeOptions, throwIfComposeFailed } from 'sidekick-docker-shared';

const compose = new ComposeClient();
const options = resolveComposeOptions(project, workspaceDirectory);
const result = await compose.up(project.name, options);
throwIfComposeFailed(result, 'Up');
```

`streamLogs` spawns `docker compose logs --follow` itself (not through `runProcess`, and with no deadline); it has its own abort signal, preserves split UTF-8 and trailing output, and throws when the command fails. The lifecycle options object does not change its signature.

All operations shell out to `docker compose` rather than using the Docker API directly, because compose orchestration logic lives in the compose CLI.

`new ComposeClient(extraEnv?, options?)` — `extraEnv` points every spawned `docker compose` at the same endpoint as the API client (see `dockerCliEnv`); `options` sets deadlines: `queryTimeoutMs` (logs/ps, default 30s) and `actionTimeoutMs` (lifecycle commands, default 15 min, since `up` may pull or build). A command killed by its deadline resolves with exit code `124` (`TIMEOUT_EXIT_CODE`) and a "timed out" line on stderr.

## runProcess

`runProcess(cmd, args, { cwd?, env?, timeoutMs?, signal?, killGraceMs?, onOutput? })` runs a command to completion and resolves with `{ exitCode, stdout, stderr, cancelled? }`. It is the process runner behind `ComposeClient`'s lifecycle and query commands and `ComposeFileReader`: output is decoded with a `StringDecoder` per stream (split multi-byte characters survive) and handed to `onOutput` as it arrives; a process past its deadline or aborted through `signal` gets `SIGTERM`, then `SIGKILL` after `killGraceMs` (default 2000); an aborted run resolves with `cancelled: true`; spawn failures (e.g. no `docker` binary) reject.

## CachedComposeFileReader

Wraps `ComposeFileReader` (`docker compose config`, 10s deadline) so the config is only re-read when its inputs could have changed:

```typescript
import { CachedComposeFileReader, ComposeFileReader } from 'sidekick-docker-shared';

const reader = new CachedComposeFileReader(new ComposeFileReader(cliEnv));
const config = await reader.read(process.cwd());            // spawns once
await reader.read(process.cwd());                            // cached: compose files unchanged
await reader.read(process.cwd(), { force: true });          // re-read now
```

No compose file → `null` without spawning; unchanged files (by a stat signature) → the cached result, re-read anyway after `maxAgeMs` (default 5 min) to catch `include:`/`extends:` edits; concurrent reads share one spawn; timeouts and other transient failures are not cached, and return the last good config for that directory instead of `null`. `DockerStateStore` uses it by default.
