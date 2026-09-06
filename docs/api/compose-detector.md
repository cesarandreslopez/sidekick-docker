# ComposeDetector & ComposeClient

## ComposeDetector

Discovers Compose projects from container labels. Optionally merges with compose file config to include services with no running containers.

### Usage

```typescript
import { ComposeDetector } from 'sidekick-docker-shared';

const detector = new ComposeDetector();
const containers = await client.listContainers();
const projects = detector.detect(containers);
```

### Detection Methods

1. **Label-based** (primary) — reads `com.docker.compose.project` and `com.docker.compose.service` from container labels
2. **File-based** (secondary) — runs `docker compose config` to discover the full service list from compose files

The detector merges both sources, so you see running containers and planned services in a single view.

### Return Type

Returns an array of `ComposeProject` objects, each containing:

- `name` — project name
- `services` — array of `ComposeService` objects with name, state, container ID (if running), and configuration
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
| `streamLogs` | `(project: string, service?: string, tail?: number, signal?: AbortSignal) => AsyncIterable<LogEntry>` | Follow logs; default tail is 100 |

Lifecycle methods resolve to a `ComposeExecResult` (`exitCode`, `stdout`, `stderr`); use `throwIfComposeFailed(result, operation)` to turn a nonzero exit into a `ComposeError`. String `cwd` arguments remain supported. `ComposeCommandOptions` accepts `{ cwd?: string; configFiles?: string[] }`, passing every file with `-f` in the supplied order.

Use `resolveComposeOptions(source, fallback?)` to resolve recorded paths and reject missing files before an action:

```typescript
import { ComposeClient, resolveComposeOptions, throwIfComposeFailed } from 'sidekick-docker-shared';

const compose = new ComposeClient();
const options = resolveComposeOptions(project, workspaceDirectory);
const result = await compose.up(project.name, options);
throwIfComposeFailed(result, 'Up');
```

`streamLogs` has its own abort signal, preserves split UTF-8 and trailing output, and throws when the command fails. The lifecycle options object does not change its signature.

All operations shell out to `docker compose` rather than using the Docker API directly, because compose orchestration logic lives in the compose CLI.
