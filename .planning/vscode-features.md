# VSCode Extension Feature Inventory

Complete feature inventory of `sidekick-docker-vscode/` — the VSCode extension package of the Docker management dashboard.

---

## 1. Panels & Tabs

The webview has **5 panels** switchable via tabs (keyboard shortcuts 1-5). Each panel has a side list (left) and detail pane (right) with its own detail tabs.

### 1.1 Containers Panel (key: 1)

**Side List:**
- Items grouped by state: "Running" (expanded), "Stopped" (collapsed)
- Each item shows: state icon (unicode), container name (truncated), status badge
- Icons: `▶` running (green), `‖‖` paused (yellow), `↻` restarting (blue), `■` exited (red), `☠` dead (red), `○` created, `…` removing
- Sort: running (sortKey 0) before stopped (sortKey 1)
- Searchable text: name, image, state

**Detail Tabs (5):**

| # | Tab | Content | Auto-scroll |
|---|-----|---------|-------------|
| 1 | Logs | Streamed log entries with severity badges, filtering, token colorization | Yes |
| 2 | Stats | CPU%, Memory (used/limit/%), Network I/O, Block I/O, PIDs with sparklines | No |
| 3 | Env | Sorted environment variables in key-value grid | No |
| 4 | Config | ID, Name, Image, State, Status, Health, Created, Ports, Compose project/service | No |
| 5 | Patterns | Log pattern clustering via `LogTemplateEngine`, up to 20 patterns with counts | No |

### 1.2 Services Panel (key: 2)

**Side List:**
- Hierarchical: projects at top level, services indented (2 spaces) below
- Project icons: `▶` running, `▷` partial, `■` stopped
- Service icons: same state icons as containers
- Item IDs: `project:{name}` or `service:{project}:{name}`
- Sort: preserves data order

**Detail Tabs (2):**

| # | Tab | Content | Auto-scroll |
|---|-----|---------|-------------|
| 1 | Info | **Project**: name, status (colorized), service count, service list with icon/name/image. **Service**: name, project, image, state, container ID, ports | No |
| 2 | Logs | Compose log stream for selected project or service; colorized entries | Yes |

### 1.3 Images Panel (key: 3)

**Side List:**
- Icon: `◉` normal, `○` dangling
- Badge: file size
- Sort: normal (0) before dangling (1)
- Searchable text: tags (joined)

**Detail Tabs (1):**

| # | Tab | Content |
|---|-----|---------|
| 1 | Info | ID (first 19 chars), Tags, Size, Created, Dangling (boolean) |

### 1.4 Volumes Panel (key: 4)

**Side List:**
- Icon: `◉` in use, `○` unused
- Badge: driver name
- Sort: in-use (0) before unused (1)
- Searchable text: name, driver

**Detail Tabs (1):**

| # | Tab | Content |
|---|-----|---------|
| 1 | Info | Name, Driver, Mountpoint, Created, In Use (boolean) |

### 1.5 Networks Panel (key: 5)

**Side List:**
- Icon: `◆` default, `◇` custom
- Badge: "N containers"
- Sort: default (0) before custom (1)
- Searchable text: name, driver

**Detail Tabs (1):**

| # | Tab | Content |
|---|-----|---------|
| 1 | Info | ID, Name, Driver, Scope, Default (boolean), attached containers list (name + ID) |

---

## 2. Actions

### 2.1 Container Actions

| Key | Action | Condition | Confirm? |
|-----|--------|-----------|----------|
| `s` | Start | state !== 'running' | No |
| `S` | Stop | state === 'running' | No |
| `r` | Restart | state === 'running' | No |
| `p` | Pause | state === 'running' | No |
| `u` | Unpause | state === 'paused' | No |
| `c` | Copy Logs | Always | No |
| `d` | Remove | Always | Yes ("Remove this container?") |
| `e` | Exec | state === 'running' | No |

- **Exec** opens a VSCode terminal running `docker exec -it {containerId} /bin/sh`, named `Exec: {containerName}`
- **Copy Logs** sends log text to extension which writes to system clipboard

### 2.2 Service/Compose Actions

**Project-level:**

| Key | Action | Confirm? |
|-----|--------|----------|
| `u` | Up (compose up) | No |
| `D` | Down (compose down) | Yes |
| `r` | Restart | No |
| `S` | Stop | No |

**Service-level:**

| Key | Action | Confirm? | Scope |
|-----|--------|----------|-------|
| `u` | Up | No | Entire project |
| `D` | Down | Yes | Entire project |
| `r` | Restart | No | Specific service |
| `S` | Stop | No | Specific service |

### 2.3 Image Actions

| Key | Action | Confirm? |
|-----|--------|----------|
| `d` | Remove | Yes ("Remove this image?") |
| `P` | Prune dangling | Yes ("Prune all dangling images?") |

### 2.4 Volume Actions

| Key | Action | Condition | Confirm? |
|-----|--------|-----------|----------|
| `d` | Remove | NOT in use | Yes |
| `P` | Prune unused | Always | Yes ("Prune all unused volumes?") |

### 2.5 Network Actions

| Key | Action | Condition | Confirm? |
|-----|--------|-----------|----------|
| `d` | Remove | NOT default AND no containers attached | Yes |
| `P` | Prune unused | Always | Yes ("Prune all unused networks?") |

### 2.6 Command Palette Commands

| Command ID | Label | Icon | Notes |
|------------|-------|------|-------|
| `sidekick-docker.openDashboard` | Open Dashboard | dashboard | Opens webview panel |
| `sidekick-docker.refreshContainers` | Refresh Containers | refresh | Forces watcher refresh |
| `sidekick-docker.startContainer` | Start | debug-start | Tree view context menu (stopped/exited/created) |
| `sidekick-docker.stopContainer` | Stop | debug-stop | Tree view context menu (running) |
| `sidekick-docker.openContainerInDashboard` | Open in Dashboard | — | Opens container in webview |
| `sidekick-docker.quickStart` | Start Container... | — | Quick pick: shows stopped containers |
| `sidekick-docker.quickStop` | Stop Container... | — | Quick pick: shows running containers |
| `sidekick-docker.quickRestart` | Restart Container... | — | Quick pick: shows running containers |

### 2.7 Confirmation Dialogs

- Centered modal overlay with message text
- Keyboard: `y` or `Enter` confirms, `n` or `Escape` cancels
- Also has clickable Yes/No buttons
- Used for: remove (containers, images, volumes, networks), prune (images, volumes, networks), compose down

---

## 3. Log Features

### 3.1 Log Streaming
- Selection-driven: starts when container selected, stops on deselection
- Follows logs in real-time (`follow: true, tail: 100`)
- Ring buffer stores entries per container in `Map<containerId, LogEntry[]>`
- Auto-scrolls log tab to bottom on new entries

### 3.2 Log Filtering
- **Filter input**: text field with placeholder "Filter logs..."
- **Filter modes**: `exact` (substring match) and `fuzzy`
- **Mode toggle button** (id: `log-filter-mode`): switches between exact/fuzzy
- **Match counter**: displays "N matches" next to filter
- **Match highlighting**: `<mark class="log-match">` wraps matched text
- Filter string stored per-container; cleared on panel switch

### 3.3 Severity Detection & Badges
- `LogAnalytics` computes `SeverityCounts` per container: `{ error, warn, info, debug, total }`
- Badge display: `E:N W:N I:N D:N` shown above log content
- Recalculated on every `updateLogs` message

### 3.4 Token Colorization
Each log line is tokenized and wrapped with CSS classes:

| Token Type | CSS Class | Example |
|------------|-----------|---------|
| Error severity | `tok-sev-error` | ERROR, FATAL |
| Warn severity | `tok-sev-warn` | WARN, WARNING |
| Info severity | `tok-sev-info` | INFO |
| Debug severity | `tok-sev-debug` | DEBUG, TRACE |
| Safe HTTP methods | `tok-http-safe` | GET, HEAD |
| Unsafe HTTP methods | `tok-http-unsafe` | POST, PUT, DELETE |
| HTTP 2xx | `tok-status-2xx` | 200, 201 |
| HTTP 3xx | `tok-status-3xx` | 301, 302 |
| HTTP 4xx | `tok-status-4xx` | 404, 403 |
| HTTP 5xx | `tok-status-5xx` | 500, 503 |
| URLs | `tok-url` | https://... |
| IP addresses | `tok-ip` | 192.168.1.1 |
| Timestamps | `tok-timestamp` | ISO dates |
| JSON keys | `tok-json-key` | "key": |
| OK states | `tok-state-ok` | true, success |
| Fail states | `tok-state-fail` | false, failed |
| File paths | `tok-path` | /var/log/... |

- Stderr lines wrapped in `log-stderr` span
- When filter active: highlighting replaces tokenization

### 3.5 Pattern Clustering
- **Patterns detail tab** on Containers panel
- Uses `LogTemplateEngine` from shared library
- Clusters similar log lines into templates
- Displays up to 20 patterns, each showing:
  - Occurrence count
  - Pattern text with wildcard `<*>` highlighted
- Empty state message when no patterns detected

### 3.6 Copy Logs
- Action key `c` copies log text
- Sends `copyLogs` message to extension
- Extension writes to clipboard via `vscode.env.clipboard.writeText()`

---

## 4. Stats Features

### 4.1 Metrics Displayed

| Metric | Format | Visual |
|--------|--------|--------|
| CPU % | Percentage | Color-coded bar (green/yellow/red) |
| Memory | Used / Limit (%) | Color-coded bar |
| Network Rx | Formatted bytes (↓) | Text |
| Network Tx | Formatted bytes (↑) | Text |
| Block Read | Formatted bytes (R) | Text |
| Block Write | Formatted bytes (W) | Text |
| PIDs | Count | Text |

### 4.2 Color-Coded Bars
- Green: value <= 50%
- Yellow: value > 50% and <= 80%
- Red: value > 80%
- Values clamped to 100%

### 4.3 Sparkline Rendering
- Bar characters: `▁▂▃▄▅▆▇█` (8 levels)
- Normalizes values to 0-100% of max in window
- Default width: 40 characters
- Rendered as `<span class="sparkline">`
- Two sparkline rows: CPU history and Memory history
- Only shown when history data is present

### 4.4 Update Frequency
- Stats streamed in real-time from `DockerService`
- Loading indicator: 200ms delay before showing "Loading stats..." spinner
- Re-renders only when stats tab is active and correct container is selected
- Selection-driven: stream starts on select, stops on deselect

### 4.5 Stats State
```
StatsData {
  stats: SerializedContainerStats;
  loading: boolean;
  cpuHistory?: number[];
  memoryHistory?: number[];
}
```

---

## 5. Compose/Services Features

### 5.1 Project Detection
- **Primary**: Container labels (`com.docker.compose.project`, `com.docker.compose.service`)
- **Secondary**: `docker compose config` / compose file detection from CWD
- Merged view: shows both running containers and planned services

### 5.2 Project Status
- `running`: All services have running containers
- `partial`: Some services running, some stopped/not created
- `stopped`: All services stopped or not created

### 5.3 Service States (7)
`running`, `paused`, `exited`, `restarting`, `dead`, `created`, `not_created`

### 5.4 Service Grouping
- Projects displayed as parent items in side list
- Services indented (2 spaces) beneath their project
- Selection of project or service triggers appropriate log streaming

### 5.5 Compose Actions
- **Up**: `docker compose up` (project-level always)
- **Down**: `docker compose down` (project-level, requires confirmation)
- **Restart**: Per-project or per-service
- **Stop**: Per-project or per-service

### 5.6 Compose Log Streaming
- Separate system from container logs (uses `docker compose logs`)
- Streams entire project logs (serviceName = null) or specific service
- Stored in `composeLogs: Map<key, LogEntry[]>` keyed by `projectName:serviceName` or `projectName`
- Auto-scroll on new entries

---

## 6. UI Features

### 6.1 Keyboard Navigation

| Key | Action | Context |
|-----|--------|---------|
| `1-5` | Switch panel | Global |
| `j` / `Down` | Navigate down in list | Global |
| `k` / `Up` | Navigate up in list | Global |
| `g` | Go to first item | Global |
| `G` | Go to last item | Global |
| `[` | Previous detail tab | Global |
| `]` | Next detail tab | Global |
| `/` | Toggle filter overlay | Global |
| `x` | Open context menu | Global |
| `Escape` | Clear filter / close overlay | Global |
| `y` / `Enter` | Confirm | Confirm dialog |
| `n` / `Escape` | Cancel | Confirm dialog |
| `j/k` / arrows | Navigate options | Context menu |
| `Enter` | Execute selected | Context menu |
| Action keys | Execute action directly | Context menu open |

### 6.2 Overlays

| Overlay | Trigger | Dismiss | Purpose |
|---------|---------|---------|---------|
| Confirm Dialog | Destructive action | y/n/Enter/Escape | Confirmation before remove/prune/down |
| Filter Overlay | `/` key | Escape (clear) or Enter (keep) | Text search within panel |
| Context Menu | `x` key | Escape or action execution | Action palette for selected item |

### 6.3 Toast Notifications
- 3 severity levels: error (4s), warning (3s), info (2s)
- Auto-dismiss with fade animation (200ms fade-out before removal)
- Stack in toast container at bottom
- Used for: Docker errors, action feedback

### 6.4 Sorting
- Each panel defines `sortKey` per item
- Containers: running (0), stopped (1)
- Images: normal (0), dangling (1)
- Volumes: in-use (0), unused (1)
- Networks: default (0), custom (1)
- Services: data order preserved

### 6.5 Filtering (Main)
- Panel-level filter across side list items
- Case-insensitive substring match on panel's `getSearchableText()`
- Status bar shows: `Filter: "query" (X of Y)`
- Cleared on panel switch
- Posts `filterChange` to extension

### 6.6 Status Bar
- **Left**: Keyboard hints (`/ filter  x actions  1-5 panels`)
- **Center**: Action shortcuts for selected item (`key:label` format)
- **Right**: Connection status (green dot + running/total count, or "disconnected")
- **Filter indicator**: Shows active filter query and match count
- **Version display**: Extension version

### 6.7 Phrase Rotation
- Extension sends 50 random phrases on webview ready (from shared `branding/phrases`)
- Displayed in tab bar area
- Rotates every 7 seconds
- Also rotates on any keydown or mousedown interaction
- Timer resets on each rotation

### 6.8 Empty States
- Panel shows emoji + title + subtitle when no items exist
- Different message per panel (e.g., "No containers found")

### 6.9 Detail Content Animation
- Fade-in animation on content change
- CSS class manipulation: remove → reflow → add

---

## 7. Extension-Specific Features

### 7.1 Tree View Provider (`ContainerTreeProvider`)

**Structure:**
- Implements `vscode.TreeDataProvider<TreeElement>`
- Root level shows 3 group items (if non-empty):
  1. **Running** (expanded by default)
  2. **Stopped** (collapsed)
  3. **Other** (collapsed) — paused, restarting, dead, etc.

**Tree Items (`ContainerTreeItem`):**
- Label: container name
- Description: image name
- Tooltip: multi-line (name, image, state, status)
- Context value: `container-{state}` (enables conditional menus)
- State-specific icons with VSCode theme colors:
  - running: play icon (green)
  - paused: pause icon (yellow)
  - exited: stop icon (red)
  - restarting: sync icon (blue)
  - dead: error icon (red)
  - default: circle-outline
- Click command: `sidekick-docker.openContainerInDashboard`

**Disconnected State:**
- Shows warning item: "Docker daemon not running"

**Empty State:**
- Shows info item: "No containers"
- Welcome view: "No containers found" with "Open Dashboard" link

### 7.2 Container Watcher Service (`ContainerWatcherService`)

**Purpose:** Lightweight, always-on service for tree view, badge, and status bar (does NOT power the dashboard).

**Callbacks:**
- `onContainersChanged(containers)`: Updates tree, badge, status bar
- `onConnectionChanged(connected)`: Reflects connection state

**Timers:**
- Refresh interval: 30 seconds (periodic full refresh)
- Reconnect interval: 10 seconds (when Docker offline)
- Debounce timer: 100ms (rapid event coalescing)

**Docker Events Handled:**
- `start`, `unpause` → state = running
- `stop`, `die` → state = exited
- `pause` → state = paused
- `destroy` → remove from list

**Lifecycle:** start → tryConnect → watch events → refresh on changes → dispose

### 7.3 Docker Service (`DockerService`)

**Purpose:** Full-featured service for dashboard. Manages Docker interactions and streaming.

**Callbacks:**
- `onStateChange(snapshot)`: Full state snapshot
- `onLogsChange(containerId, entries)`: Log entries
- `onStatsChange(containerId, stats, loading, cpuHistory, memoryHistory)`: Stats
- `onComposeLogs(projectName, serviceName, entries)`: Compose logs
- `onEnvLoaded(containerId, env)`: Environment variables
- `onError(message)`: Error notification

**State Managed:**
- All resources: containers, images, volumes, networks, compose projects
- Daemon connection, last refresh timestamp
- Active streams: log container ID, stats container ID, compose log project/service
- Environment variable cache per container

**Selection-Driven Streaming:**
- On container select: stop previous streams → start log stream (follow: true, tail: 100) → start stats stream → fetch env (cached)
- On compose service select: stop previous compose stream → start compose log stream
- Stats loading indicator: 200ms delay before showing loading state

**Refresh Strategy:**
- 30-second periodic refresh
- Event-driven immediate updates (Docker events via `EventWatcher`)
- 100ms debounce on rapid events
- Manual force refresh via command

**Actions (all trigger refresh after completion):**
- Containers: start, stop, restart, pause, unpause, remove
- Images: remove, prune
- Volumes: remove, prune
- Networks: remove, prune
- Compose: up, down, restart, stop (project or service scope)

### 7.4 Message Protocol

**Extension → Webview (8 message types):**

| Type | Payload | Purpose |
|------|---------|---------|
| `updateState` | `DashboardStateSnapshot` | Full state refresh |
| `updateLogs` | `containerId`, `entries[]` | Log stream data |
| `updateStats` | `containerId`, `stats`, `loading`, `cpuHistory[]`, `memoryHistory[]` | Stats stream data |
| `updateEnv` | `containerId`, `env[]` | Environment variables |
| `phraseBank` | `phrases[]` (50) | Phrase rotation bank |
| `toast` | `message`, `severity` | Notification |
| `focusContainer` | `containerId` | Navigate to container |
| `updateComposeLogs` | `projectName`, `serviceName`, `entries[]` | Compose log stream |

**Webview → Extension (10 message types):**

| Type | Payload | Purpose |
|------|---------|---------|
| `webviewReady` | — | Initialization signal |
| `switchPanel` | `panelIndex` | Panel tab switch |
| `selectItem` | `panelId`, `itemId` | Item selection |
| `switchDetailTab` | `tabIndex` | Detail tab switch |
| `action` | `actionType`, `itemId`, `panelId` | Execute action |
| `filterChange` | `filter` | Filter text change |
| `execContainer` | `containerId` | Open exec terminal |
| `requestRefresh` | — | Force refresh |
| `selectComposeService` | `projectName`, `serviceName` | Compose service selection |
| `copyLogs` | `text` | Copy to clipboard |

**Validation:** Zod schemas validate all incoming webview messages at trust boundary (`messageSchemas.ts`).

### 7.5 Status Bar Item
- Alignment: right (priority 100)
- Format: `$(package) {running}/{total}` (e.g., `$(package) 3/5`)
- Warning state: `$(package) Docker offline` with warning color
- Click action: opens dashboard
- Updated by `ContainerWatcherService` callbacks

### 7.6 Badge (Activity Bar)
- Shows running container count on the Sidekick Docker activity bar icon
- Updated on every container list change

### 7.7 Webview HTML/CSS
- CSP nonce-based security for all scripts/styles
- VSCode theme variable integration (uses `--vscode-*` CSS custom properties)
- Local resource roots: `out/webview/` and `images/`
- DOM structure: tab bar → main area (side list + detail pane) → status bar → overlays → toast container → context menu

### 7.8 Build System (esbuild)
- **Extension host bundle**: `src/extension.ts` → `out/extension.js` (CJS, Node, externals: vscode)
- **Webview bundle**: `src/webview/dashboard.ts` → `out/webview/dashboard.js` (IIFE, browser, ES2020)
- Native module stubs: ssh2, cpu-features
- Injects `__VERSION__` from package.json
- Supports `--watch` and `--production` flags

### 7.9 Utilities
- `src/utils/nonce.ts`: Generates CSP nonce strings for webview security

---

## 8. Data Types Summary

### Serialized Types (for postMessage transport)

| Type | Key Fields |
|------|------------|
| `SerializedContainerInfo` | id, name, image, state, status, ports[], created, composeProject?, composeService?, healthStatus? |
| `SerializedImageInfo` | id, repoTags[], size, created, isDangling |
| `SerializedVolumeInfo` | name, driver, mountpoint, created, isInUse |
| `SerializedNetworkInfo` | id, name, driver, scope, containers[], isDefault |
| `SerializedComposeProject` | name, configFile?, services[], status |
| `SerializedComposeService` | name, projectName, containerId?, state, image, ports[] |
| `SerializedContainerStats` | cpuPercent, memoryUsage, memoryLimit, memoryPercent, networkRx, networkTx, blockRead, blockWrite, pids |
| `SerializedLogEntry` | timestamp, stream ('stdout'/'stderr'), message |

### DashboardStateSnapshot
Contains: containers[], images[], volumes[], networks[], composeProjects[], daemonRunning, lastRefresh

---

## 9. Source File Map

| File | LOC | Purpose |
|------|-----|---------|
| `src/extension.ts` | — | Activation, commands, status bar, badge |
| `src/providers/DockerDashboardProvider.ts` | ~959 | Webview panel, message routing, HTML template |
| `src/providers/ContainerTreeProvider.ts` | — | Sidebar tree view |
| `src/services/DockerService.ts` | — | Docker operations, streaming, state |
| `src/services/ContainerWatcherService.ts` | — | Lightweight always-on watcher |
| `src/types/messages.ts` | — | Message type definitions |
| `src/types/messageSchemas.ts` | — | Zod validation schemas |
| `src/utils/nonce.ts` | — | CSP nonce generation |
| `src/webview/dashboard.ts` | ~776 | Main webview logic, rendering, keyboard |
| `src/webview/state.ts` | — | WebviewState interface |
| `src/webview/formatters.ts` | — | Colorization, sparklines, grids |
| `src/webview/panels/types.ts` | — | PanelDefinition, PanelItem, ActionDefinition |
| `src/webview/panels/containers.ts` | — | Container panel (5 detail tabs, 8 actions) |
| `src/webview/panels/services.ts` | — | Services panel (2 tabs, 4 actions) |
| `src/webview/panels/images.ts` | — | Images panel (1 tab, 2 actions) |
| `src/webview/panels/volumes.ts` | — | Volumes panel (1 tab, 2 actions) |
| `src/webview/panels/networks.ts` | — | Networks panel (1 tab, 2 actions) |
