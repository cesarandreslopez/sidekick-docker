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
| `up` | `(project: string) => Promise<void>` | Start a Compose project (`docker compose up -d`) |
| `down` | `(project: string) => Promise<void>` | Stop a Compose project (`docker compose down`) |
| `restart` | `(project: string, service?: string) => Promise<void>` | Restart a project or specific service |
| `stop` | `(project: string, service?: string) => Promise<void>` | Stop a project or specific service |

All operations shell out to `docker compose` rather than using the Docker API directly, because compose orchestration logic lives in the compose CLI.
