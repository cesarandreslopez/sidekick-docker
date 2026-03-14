# CLI/TUI Feature Inventory

Exhaustive feature catalog of `sidekick-docker-cli` — the Ink/React TUI dashboard and CLI commands.

---

## 1. Panels & Tabs

### 1.1 Containers Panel (key `1`)

**File:** `sidekick-docker-cli/src/dashboard/panels/ContainersPanel.ts`

**List view columns:**

| Element | Description |
|---------|-------------|
| Icon | `●` running, `○` exited/stopped, `⊘` paused (from `stateIcon()`) |
| Label | Container name, truncated to 34–38 chars |
| Health badge | Colorized health status (healthy/unhealthy) if present |
| Port hint | First exposed host port (e.g. `:8080`), shown when running |
| Right label | Compact uptime string (e.g. `2h 30m`) |
| Right color | Green if running, gray otherwise |
| Icon color | State-dependent (green running, gray stopped) |

**Searchable text:** `name image state`

**Detail tabs (5):**

#### Logs (autoScrollBottom: true)
- Severity counts header: `E:N W:N I:N D:N` — colored red/yellow/blue/gray, only if counts > 0
- Log entries rendered via `colorizeLogEntry()` with full token colorization
- When log filter active: only matching lines shown + match count line + highlighted matches (blue background)
- Empty state: "No logs available. Select a container to view logs."

#### Stats
- **CPU:** percentage + colored sparkline (brand blue) with min/max/time labels
- **Memory:** used/limit + percentage + colored sparkline (green) with min/max/time labels
- **Network:** `▼ RX ▲ TX` bytes + Rx/Tx rate sparklines
- **Block I/O:** `R read W write` bytes + read/write rate sparklines
- **PIDs:** process count
- **Log Activity:** severity time-series sparkline (colored by dominant severity per bucket)
- Loading state: braille spinner animation (`⠋⠙⠚⠒⠂⠂⠒⠇⠏`) + "Loading stats..."
- Non-running state: "Container is not running."

#### Env
- Sorted environment variables, colorized key=value pairs via `colorizeEnvLine()`
- Lazy-loaded on selection (fetched via `inspect`)
- Empty state: "No environment variables set."
- Loading state: "Loading environment variables..."

#### Config
- **Identity section:** ID (shortened + colorized), Name, Image
- **Status section:** State (colorized), Status, Health (if present, colorized), Created timestamp
- **Network section:** Ports list (formatted)
- **Compose section** (if applicable): Project name, Service name

#### Patterns
- "Top Log Patterns" section header
- Each pattern: yellow count (padded 5 chars) + template with gray `<*>` wildcards
- Empty state: "No log patterns detected yet. Patterns will appear as logs stream in."

---

### 1.2 Services Panel (key `2`)

**File:** `sidekick-docker-cli/src/dashboard/panels/ServicesPanel.ts`

**List view — hierarchical (projects with nested services):**

| Element | Type | Description |
|---------|------|-------------|
| Project icon | Project | `▶` running, `▷` partial, `■` stopped |
| Project label | Project | Project name |
| Project right label | Project | `running/total` count (e.g. `2/3`) |
| Project icon color | Project | Green (running), yellow (partial), red (stopped) |
| Service icon | Service | State icon (same as containers) |
| Service label | Service | Indented (`  `) + service name, truncated to 36 chars |
| Service icon color | Service | State color |

**Empty state:** "No compose projects found" placeholder item.

**Searchable text:** project: `projectName`; service: `projectName serviceName image`

**Detail tabs (2):**

#### Info
- **For projects:** Project name, Status (colorized), Service count, list of services with state icons + image
- **For services:** Service name, Project name, Image, State (colorized), Container ID (colorized or "not created"), Ports (or "none")
- **No data:** "No compose projects detected. Compose projects are detected from container labels (com.docker.compose.project) or from a compose file in the CWD."

#### Logs (autoScrollBottom: true)
- Compose logs rendered via `colorizeLogEntry()`
- Empty state: "No compose logs. Logs will appear when a service produces output."

---

### 1.3 Images Panel (key `3`)

**File:** `sidekick-docker-cli/src/dashboard/panels/ImagesPanel.ts`

**List view columns:**

| Element | Description |
|---------|-------------|
| Icon | `●` tagged image, `○` dangling image |
| Label | First repo tag or `<none>`, truncated to 38 chars |
| Right label | Formatted size (e.g. `1.5 GB`) |
| Right color | Gray |
| Icon color | Brand blue (`#2B4C7E`) for tagged, gray for dangling |

**Sort key:** dangling = 1, tagged = 0 (tagged first).

**Searchable text:** all repo tags joined by space.

**Detail tabs (1):**

#### Info
- ID (shortened + colorized)
- Tags (comma-separated)
- Size (formatted bytes)
- Created (locale string)
- Dangling (colorized boolean)

---

### 1.4 Volumes Panel (key `4`)

**File:** `sidekick-docker-cli/src/dashboard/panels/VolumesPanel.ts`

**List view columns:**

| Element | Description |
|---------|-------------|
| Icon | `●` in use, `○` unused |
| Label | Volume name, truncated to 38 chars |
| Right label | Driver name (e.g. `local`) |
| Right color | Gray |
| Icon color | Green (in use), gray (unused) |

**Sort key:** in-use = 0, unused = 1 (in-use first).

**Searchable text:** `name driver`

**Detail tabs (1):**

#### Info
- Name
- Driver
- Mountpoint
- Created (locale string)
- In Use (colorized boolean)

---

### 1.5 Networks Panel (key `5`)

**File:** `sidekick-docker-cli/src/dashboard/panels/NetworksPanel.ts`

**List view columns:**

| Element | Description |
|---------|-------------|
| Icon | `◆` default network, `◇` custom network |
| Label | Network name, truncated to 38 chars |
| Right label | Container count (if > 0, else empty) |
| Right color | Green (has containers), gray (none) |
| Icon color | Brand blue (`#2B4C7E`) for default, gray for custom |

**Sort key:** default = 0, custom = 1 (default first).

**Searchable text:** `name driver`

**Detail tabs (1):**

#### Info
- ID (shortened + colorized)
- Name
- Driver
- Scope
- Default (colorized boolean)
- Containers section: list of `containerName (containerId)` colorized, or "(none)"

---

## 2. Actions

### 2.1 Container Actions

| Key | Label | Condition | Confirm | Severity | Handler |
|-----|-------|-----------|---------|----------|---------|
| `s` | Start | state ≠ running | No | — | `client.startContainer(id)` |
| `S` | Stop | state = running | No | — | `client.stopContainer(id)` |
| `r` | Restart | state = running | No | — | `client.restartContainer(id)` |
| `p` | Pause | state = running | No | — | `client.pauseContainer(id)` |
| `u` | Unpause | state = paused | No | — | `client.unpauseContainer(id)` |
| `d` | Remove | always | **Yes** | **high** | `client.removeContainer(id, true)` (force) |
| `e` | Exec | state = running | No | — | Launches PTY shell via ExecManager |
| `c` | Copy Logs | always | No | — | Copies filtered/all logs to clipboard |

### 2.2 Service Actions

| Key | Label | Condition | Confirm | Severity | Handler |
|-----|-------|-----------|---------|----------|---------|
| `u` | Up | data ≠ null | No | — | `composeClient.up(projectName, cwd)` |
| `D` | Down | data ≠ null | **Yes** | **high** | `composeClient.down(projectName, cwd)` |
| `r` | Restart | data ≠ null | No | — | `composeClient.restart(project, [service], cwd)` |
| `S` | Stop | data ≠ null | No | — | `composeClient.stop(project, [service], cwd)` |

Restart and Stop work on both projects (all services) and individual services.

### 2.3 Image Actions

| Key | Label | Condition | Confirm | Severity | Handler |
|-----|-------|-----------|---------|----------|---------|
| `d` | Remove | always | **Yes** | **high** | `client.removeImage(id)` |
| `P` | Prune | always | **Yes** | **batch** | `client.pruneImages()` |

### 2.4 Volume Actions

| Key | Label | Condition | Confirm | Severity | Handler |
|-----|-------|-----------|---------|----------|---------|
| `d` | Remove | not in use | **Yes** | **high** | `client.removeVolume(name)` |
| `P` | Prune | always | **Yes** | **batch** | `client.pruneVolumes()` |

### 2.5 Network Actions

| Key | Label | Condition | Confirm | Severity | Handler |
|-----|-------|-----------|---------|----------|---------|
| `d` | Remove | not default AND no containers | **Yes** | **high** | `client.removeNetwork(id)` |
| `P` | Prune | always | **Yes** | **batch** | `client.pruneNetworks()` |

### 2.6 Confirmation System

**Defined in:** `dashboardTypes.ts` — severity: `'low' | 'high' | 'batch'`

| Severity | Icon | Title | Border | Warning text |
|----------|------|-------|--------|-------------|
| `low` | ⚠ | "Confirm" | Yellow | (none) |
| `high` | ✗ | "Destructive Action" | Red | "This cannot be undone." |
| `batch` | ✗✗ | "Batch Destructive Action" | Red | "This cannot be undone." |

**Confirm keys:** `y`/`Y` confirm, `n`/`N` cancel, `Esc` cancel.

### 2.7 Async Action Feedback

Promise-based actions trigger toast notifications:
1. Action starts → info toast with braille spinner: `"{action}…"`
2. On success → success toast: `"{action}"`
3. On error → error toast: `"{action} failed"`

---

## 3. Log Features

### 3.1 Log Filtering

**File:** `sidekick-docker-shared/src/log/LogFilter.ts`

| Mode | Algorithm |
|------|-----------|
| **Exact** | Case-insensitive `indexOf()` substring match |
| **Fuzzy** | All whitespace-separated query words must appear (AND logic) |

- Returns `FilterResult` with `matched: boolean` and `matches: FilterMatch[]` (start + length)
- Matched regions highlighted with blue background in log display
- Activated with `f` key (Containers panel, Logs tab only)
- `Tab` toggles mode, `Enter` applies, `Esc` clears

### 3.2 Severity Detection

**File:** `sidekick-docker-shared/src/log/LogAnalytics.ts`

Regex matching on first 200 characters of each log line:

| Keywords | Severity |
|----------|----------|
| `FATAL`, `PANIC`, `ERROR`, `ERR` | `error` |
| `WARN`, `WARNING` | `warn` |
| `INFO` | `info` |
| `DEBUG`, `TRACE` | `debug` |
| (no match) | `other` |

### 3.3 Severity Badges

Displayed in Logs tab header: `E:N  W:N  I:N  D:N`

| Badge | Color |
|-------|-------|
| `E:N` (error) | Red (`\x1b[31m`) |
| `W:N` (warn) | Yellow (`\x1b[33m`) |
| `I:N` (info) | Brand blue (`\x1b[38;2;43;76;126m`) |
| `D:N` (debug) | Gray (`\x1b[90m`) |

Only badges with count > 0 are shown.

### 3.4 Severity Time-Series Sparkline

**File:** `sidekick-docker-shared/src/log/LogSeverityTimeSeries.ts`

- Ring buffer: **60 buckets**, 1 minute per bucket (1-hour window)
- Each bucket tracks: error, warn, info, debug, other counts + total
- Time boundaries: `Math.floor(now / 60000) * 60000`
- Rendered in Stats tab under "Log Activity" section
- Unicode block chars: `█▇▆▅▄▃▂▁` (8 levels)
- Each bar colored by **dominant severity** in that bucket (error > warn > info > debug)

### 3.5 Log Pattern Clustering

**File:** `sidekick-docker-shared/src/log/LogTemplateEngine.ts`

Simplified Drain-like algorithm:
1. Groups logs by token count (whitespace-split)
2. Within same-count groups, compares token-by-token
3. Variable tokens detected and replaced with `<*>`:
   - Hex strings (8+ chars): `^[0-9a-f]{8,}$`
   - UUIDs: `^[0-9a-f]{8}-[0-9a-f]{4}-...`
   - IP addresses: `^\d+\.\d+\.\d+\.\d+`
   - Dates: `^\d{4}-\d{2}-\d{2}`
   - Numbers: `^\d+$`
   - Unix paths: `^\/[\w/.-]+$`
   - URLs: `^https?://`
   - Quoted strings: `^"[^"]*"$` or `^'[^']*'$`
4. Positions where tokens differ across group also become `<*>`
5. Matching threshold: 50% token similarity to merge into group
6. Templates sorted by frequency (most common first)

### 3.6 Token Colorization

**File:** `sidekick-docker-shared/src/log/LogTokenizer.ts`

Single-pass regex tokenizer recognizing ~20 token types:

| Token type | Color |
|------------|-------|
| `severity-error` (FATAL, PANIC, ERROR) | Red |
| `severity-warn` (WARN, WARNING) | Yellow |
| `severity-info` (INFO) | Brand blue |
| `severity-debug` (DEBUG, TRACE) | Gray |
| `http-method-safe` (GET, HEAD, OPTIONS) | Green |
| `http-method-unsafe` (PUT, POST, PATCH, DELETE) | Yellow |
| `http-status-2xx` | Green |
| `http-status-3xx` | Brand blue |
| `http-status-4xx` | Yellow |
| `http-status-5xx` | Red |
| `url` (http:// or https://) | Brand blue |
| `ip-address` (IPv4 + optional port) | Dim gray |
| `timestamp` (ISO 8601 or common log format) | Dim gray |
| `json-key` (`"key":` patterns) | Brand blue |
| `state-ok` (success, healthy, active, enabled) | Green |
| `state-fail` (fail, unhealthy, inactive) | Red |
| `path` (Unix absolute paths) | Dim gray |
| `number` | (no color) |
| `plain` | (no color) |

### 3.7 Log Streaming

**File:** `sidekick-docker-cli/src/dashboard/LogStreamManager.ts`

- Ring buffer: **1000 lines** max (`MAX_LOG_LINES` from shared)
- Initial tail: **100 lines** from Docker API
- Selection-driven: streams only for currently selected container
- Auto-reconnect with exponential backoff via `ReconnectScheduler`
- Each entry processed through: analytics (severity), time-series, template engine
- FIFO eviction when buffer exceeds 1000 lines

---

## 4. Stats Features

### 4.1 Metrics Collected

**Type:** `ContainerStats` (from `sidekick-docker-shared/src/types/container.ts`)

| Metric | Field | Description |
|--------|-------|-------------|
| CPU | `cpuPercent` | CPU usage percentage |
| Memory usage | `memoryUsage` | Bytes used |
| Memory limit | `memoryLimit` | Byte limit |
| Memory % | `memoryPercent` | Usage percentage |
| Network RX | `networkRx` | Total receive bytes |
| Network TX | `networkTx` | Total transmit bytes |
| Block read | `blockRead` | Total block read bytes |
| Block write | `blockWrite` | Total block write bytes |
| PIDs | `pids` | Process count |
| Timestamp | `timestamp` | Sample time |

### 4.2 Sparkline Rendering

**File:** `sidekick-docker-cli/src/formatters.ts`

**General sparkline:** `sparkline(values, width=40)` — scales to max, maps to 8-level Unicode blocks `▁▂▃▄▅▆▇█`.

**Colored sparkline:** `coloredSparkline(series, type)` — wraps sparkline with ANSI color + dim min/max labels + `← Ns` time window indicator.

| Series type | Color |
|-------------|-------|
| `cpu` | Brand blue |
| `memory` | Green |

**Severity sparkline:** `severitySparkline(series)` — each bar colored by dominant severity per time bucket.

### 4.3 Ring Buffer

**File:** `sidekick-docker-shared/src/stats/StatsCollector.ts`

- **60 samples** max per container
- FIFO eviction when limit exceeded
- Provides series extraction: `getCpuSeries()`, `getMemorySeries()`, `getNetworkRxRateSeries()`, `getNetworkTxRateSeries()`, `getBlockReadRateSeries()`, `getBlockWriteRateSeries()`

### 4.4 Stats Streaming

**File:** `sidekick-docker-cli/src/dashboard/StatsStreamManager.ts`

- Selection-driven: only one container streams stats at a time
- Loading spinner animation (200ms interval) while waiting for first sample
- Auto-reconnect via `ReconnectScheduler`
- Pushes samples to `StatsCollector` per container

---

## 5. Compose / Services Features

### 5.1 Project Detection

- **Primary:** Container labels (`com.docker.compose.project`, `com.docker.compose.service`)
- **Secondary:** `docker compose config` from CWD
- Merged to show both running and planned (config-only) services

### 5.2 Service Grouping

Hierarchical display:
- **Project header** with aggregated status icon + running count badge
- **Services** nested under project, indented
- Project status derived from service states: running (all), partial (some), stopped (none)

### 5.3 Compose Actions

| Action | Scope | Notes |
|--------|-------|-------|
| Up | Project or service | Starts via `docker compose up` |
| Down | Project (by project name) | Destructive, requires confirmation |
| Restart | Project or individual service | Service-level: passes service name |
| Stop | Project or individual service | Service-level: passes service name |

### 5.4 Compose Log Streaming

- Dedicated `ComposeLogStreamManager` (separate from container logs)
- Streams compose logs for selected project/service
- Displayed in Services panel → Logs tab with `colorizeLogEntry()`
- Auto-scrolls (autoScrollBottom: true)

---

## 6. UI Features

### 6.1 Sorting

**Containers panel only** (key `o` to open sort overlay).

| # | Field | Sort key | Default direction |
|---|-------|----------|-------------------|
| 1 | State | Running first (`sortKey`) | Ascending |
| 2 | Name | `name.localeCompare()` | Ascending |
| 3 | CPU % | `cpuPercent` from stats | Descending (highest first) |
| 4 | Memory % | `memoryPercent` from stats | Descending |
| 5 | Network I/O | `networkRx + networkTx` | Descending |
| 6 | Block I/O | `blockRead + blockWrite` | Descending |
| 7 | PIDs | `pids` from stats | Descending |

- `R` toggles sort direction (ascending ↔ descending)
- All other panels sort by default `sortKey` with optional reverse toggle

### 6.2 Layout Modes (key `z`)

| Mode | Side panel width | Detail pane | Focus behavior |
|------|-----------------|-------------|----------------|
| Normal | 28 chars | Remaining width | Either |
| Wide | 42 chars | Remaining width | Either |
| Expanded | 0 (hidden) | Full width | Auto-focus detail |

### 6.3 Overlays

**Type:** `OverlayKind = null | 'help' | 'context-menu' | 'filter' | 'confirm' | 'exec' | 'version' | 'log-filter' | 'sort'`

#### Help Overlay (`?`)
- All keybindings organized by category
- Panel-specific actions for active panel
- Keys shown as blue badges; destructive in red
- Version + branding
- Dismiss: `?` or `Esc`

#### Version Overlay (`V`)
- Branding: `⚡ sidekick-docker`
- Tagline + version number
- Random motivational phrase (rotates)
- Dismiss: `V` or `Esc`

#### Filter Overlay (`/`)
- Live text input with cursor indicator (`█`)
- Match count display: `X of Y items`
- Panel title context
- Help: "Enter: apply  Esc: clear"

#### Log Filter Overlay (`f`)
- Text input with mode label: `(exact)` or `(fuzzy)`
- `Tab` toggles mode
- Help: "Tab: toggle mode  Enter: apply  Esc: clear"
- Only available in Containers panel, Logs tab

#### Sort Overlay (`o`)
- 7 sort field options with current field highlighted (yellow + `▼`/`▲`)
- `j/k` navigate, `R` reverse, `Enter` apply, `Esc` close

#### Context Menu Overlay (`x`)
- Title: "☰ Actions"
- Lists applicable actions for selected item
- Destructive actions in red with ⚠ icon
- Safe actions in white
- Navigation: `j/k`, `Enter` to run, direct key press, `Esc` to close

#### Confirm Overlay (triggered by destructive actions)
- Three severity styles (low/high/batch) — see §2.6
- `y`/`Y` confirm, `n`/`N` or `Esc` cancel

#### Exec Overlay (`e` on running container)
- Full-screen PTY terminal session
- Header: "Exec: {containerName}  (Ctrl+] to detach)"
- Raw stdin passthrough
- Auto-scrolls output
- Max 5000 output lines
- `Ctrl+]` (0x1d) detaches
- Mouse disabled during exec, re-enabled on exit
- Falls back to `spawnSync` if node-pty unavailable

#### Too Small Overlay
- Shown when terminal < 60 columns or < 15 rows
- Displays current size and required increase

### 6.4 Toast Notifications

| Severity | Duration | Icon | Color |
|----------|----------|------|-------|
| `error` | 4000ms | ✗ | Red |
| `warning` | 3000ms | ⚠ | Yellow (black text) |
| `info` | 30000ms | Braille spinner (`⠋⠙⠚⠒⠂⠂⠒⠇⠏`) | Brand blue |
| `success` | 2000ms | ✓ | Green |

- Only most recent toast visible at a time
- Auto-dismissed after duration

### 6.5 Mouse Support

**Protocol:** SGR 1006 (`ESC [ < Cb ; Cx ; Cy M/m`)

| Target | Action | Behavior |
|--------|--------|----------|
| TabBar | Click | Switch panels |
| SideList | Click | Select item + focus side |
| DetailTabBar | Click | Switch detail tabs |
| SideList | Scroll wheel | 3-line scroll, adjusts selection |
| DetailPane | Scroll wheel | 3-line scroll |
| Overlays | Click | Dismiss (except filter) |

Modifier detection: Shift, Ctrl, Meta (Alt).

### 6.6 Navigation Keybindings

#### Global
| Key | Action |
|-----|--------|
| `1–5` | Switch to panel (Containers, Services, Images, Volumes, Networks) |
| `Tab` | Toggle focus between side list and detail pane |
| `?` | Help overlay |
| `V` | Version overlay |
| `q` / `Ctrl+C` | Quit (or close overlay if open) |
| `Esc` | Clear filter / close overlay / return to side |

#### Side List (focus: side)
| Key | Action |
|-----|--------|
| `j` / `↓` | Next item |
| `k` / `↑` | Previous item |
| `g` | Jump to first item |
| `G` | Jump to last item |
| `Enter` | Switch focus to detail pane |

#### Detail Pane (focus: detail)
| Key | Action |
|-----|--------|
| `j` / `↓` | Scroll down 1 line |
| `k` / `↑` | Scroll up 1 line |
| `g` | Jump to top |
| `G` | Jump to bottom |
| `h` / `←` | Return focus to side list |
| `[` / `]` | Cycle previous/next detail tabs |

#### Layout & Filtering
| Key | Action |
|-----|--------|
| `z` | Cycle layout: Normal → Wide → Expanded |
| `/` | Open panel filter overlay |
| `x` | Open context menu |

#### Containers Panel Only
| Key | Action |
|-----|--------|
| `a` | Toggle show all / running-only containers |
| `f` | Open log filter (Logs tab only) |
| `o` | Open sort menu |
| `R` | Reverse sort direction |

### 6.7 Status Bar

Always visible (except during exec overlay).

| Section | Content |
|---------|---------|
| Branding | `⚡ sidekick-docker` + version |
| Daemon status | Green `●` connected + `running/total` count, or red `○ disconnected` |
| Last refresh | `↻ Ns ago` — green if < 1min, yellow if stale |
| Panel actions | Shortcut keys for applicable actions (blue for safe, red for destructive) |
| Focus indicator | `◀` (side) or `▶` (detail) |
| Navigation hints | `j/k  Tab  /  ?  q` (dimmed) |
| Active filter | Yellow `⊙ "query" X/Y` when filter active |
| Contextual hints | Containers panel: `f:Filter logs  c:Copy  a:{Running only/Show all}  ↕{field}` |

### 6.8 Tab Bar (Header)

- Panel tabs with shortcut number + title + count badge
- **Containers badge:** `● running/total` (green all running, yellow partial, gray none)
- **Services badge:** total service count
- **Images/Volumes/Networks badge:** total count
- Active tab: brand blue inverted colors; inactive: gray
- **Rotating phrase** at far right: random motivational phrase, rotates every 7 seconds or on interaction
- **Layout mode indicator:** `z: {Normal/Wide/Expanded} ▸`

### 6.9 Detail Tab Bar
- Tab labels with `[/] cycle tabs` help text
- Active tab: inverted + bold
- Inactive tabs: gray

### 6.10 Detail Pane
- Scrollable content area with `▲`/`▼` scroll indicators + remaining line counts
- Auto-scroll to bottom when active tab has `autoScrollBottom: true`
- Scroll position preserved per tab when switching

### 6.11 Side List
- Scrollable item list with selection highlight
- Panel title with count badge
- Filter match count when filtering
- Empty-state hints per panel type

### 6.12 Real-Time Updates
- **Event watcher:** Docker event stream for container lifecycle events → immediate state updates
- **Periodic refresh:** Fallback every 30 seconds
- **Selection-driven streaming:** Logs and stats only stream for the selected item
- **Render throttling:** 100ms batching via `scheduleRender()`

---

## 7. Non-Dashboard CLI Commands

**File:** `sidekick-docker-cli/src/cli.ts` (Commander.js)

### 7.1 Default Command (Dashboard)

```
sidekick-docker [--socket <path>]
```

- `--socket <path>` — Custom Docker socket path
- Launches the full TUI dashboard

### 7.2 `ps` — List Containers

```
sidekick-docker ps [-a, --all]
```

**File:** `sidekick-docker-cli/src/commands/ps.ts`

- `-a, --all` — Show all containers (default: running only)
- Simple table output with columns: CONTAINER ID (20 chars), NAME (20 chars, with state icon), IMAGE (20 chars), STATUS (20 chars, formatted uptime), PORTS
- Pings Docker daemon first; exits with error if unreachable
- Separator: 100-char dashed line

### 7.3 `logs` — Stream Container Logs

```
sidekick-docker logs <container> [-f, --follow] [-n, --tail <lines>]
```

**File:** `sidekick-docker-cli/src/commands/logs.ts`

- `<container>` — Container name or ID (required)
- `-f, --follow` — Follow log output (default: true)
- `-n, --tail <lines>` — Number of lines from end (default: 100)
- Colored output: stderr lines in red
- Timestamps included via `formatTimestampTime()`
- Handles "no such container" error specifically

### 7.4 Global Options

- `--version` — Show version (injected via `__CLI_VERSION__` esbuild define)
- `--help` — Show help (Commander.js built-in)

---

## 8. Summary Table

### Panels

| # | Panel | Key | Detail Tabs | Actions |
|---|-------|-----|-------------|---------|
| 1 | Containers | `1` | Logs, Stats, Env, Config, Patterns (5) | Start, Stop, Restart, Pause, Unpause, Remove, Exec, Copy Logs (8) |
| 2 | Services | `2` | Info, Logs (2) | Up, Down, Restart, Stop (4) |
| 3 | Images | `3` | Info (1) | Remove, Prune (2) |
| 4 | Volumes | `4` | Info (1) | Remove, Prune (2) |
| 5 | Networks | `5` | Info (1) | Remove, Prune (2) |

### Overlays

| Overlay | Trigger | Description |
|---------|---------|-------------|
| Help | `?` | Keybinding reference |
| Version | `V` | App info + phrase |
| Filter | `/` | Live item search |
| Log Filter | `f` | Log content filter (exact/fuzzy) |
| Sort | `o` | Sort field picker (containers only) |
| Context Menu | `x` | Action picker |
| Confirm | destructive action | y/n confirmation |
| Exec | `e` | PTY terminal session |
| Too Small | auto | Terminal size warning |
