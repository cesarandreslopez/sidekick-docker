# CLI vs VSCode Parity Analysis Report

> **STALE — pre-0.3.0.** Several gaps listed below have since shipped: the sort
> overlay, the show-all toggle, layout modes, rate sparklines, the severity
> sparkline and async action feedback all exist in both surfaces. Treat this as
> historical context, not a current to-do list.

Comparative analysis of `sidekick-docker-cli` (Ink/React TUI) and `sidekick-docker-vscode` (webview extension) feature sets, with actionable gaps and implementation plan.

---

## 1. Feature Matrix

### 1.1 Panels & Tabs

| Feature | CLI | VSCode | Gap |
|---------|-----|--------|-----|
| Containers panel (5 detail tabs) | ✓ | ✓ | None |
| Services panel (2 detail tabs) | ✓ | ✓ | None |
| Images panel (1 detail tab) | ✓ | ✓ | None |
| Volumes panel (1 detail tab) | ✓ | ✓ | None |
| Networks panel (1 detail tab) | ✓ | ✓ | None |
| Panel switching (keys 1-5) | ✓ | ✓ | None |

### 1.2 Actions

| Feature | CLI | VSCode | Gap |
|---------|-----|--------|-----|
| Container: Start/Stop/Restart/Pause/Unpause | ✓ | ✓ | None |
| Container: Remove (with confirm) | ✓ | ✓ | None |
| Container: Exec | ✓ (PTY overlay) | ✓ (native terminal) | Platform-appropriate |
| Container: Copy Logs | ✓ (clipboard) | ✓ (via extension clipboard) | None |
| Service: Up/Down/Restart/Stop | ✓ | ✓ | None |
| Image: Remove/Prune | ✓ | ✓ | None |
| Volume: Remove/Prune | ✓ | ✓ | None |
| Network: Remove/Prune | ✓ | ✓ | None |
| Confirmation: 3 severity tiers (low/high/batch) | ✓ | ✗ (single style) | **Minor** |
| Async action feedback (in-progress → success/error) | ✓ | ✗ (no in-progress toast) | **Gap** |
| Success toast severity | ✓ | ✗ (uses `info` instead) | **Gap** |

### 1.3 Log Features

| Feature | CLI | VSCode | Gap |
|---------|-----|--------|-----|
| Log streaming (selection-driven, tail 100) | ✓ | ✓ | None |
| Log filtering (exact + fuzzy) | ✓ | ✓ | None |
| Severity detection (error/warn/info/debug) | ✓ | ✓ | None |
| Severity badges (E:N W:N I:N D:N) | ✓ | ✓ | None |
| Token colorization (~20 types) | ✓ | ✓ (~16 CSS classes) | None |
| Pattern clustering (LogTemplateEngine) | ✓ | ✓ | None |
| Severity time-series sparkline (Log Activity) | ✓ | ✗ | **Gap** |
| Log filter overlay (f key, mode toggle) | ✓ (overlay) | ✓ (inline bar) | Platform-appropriate |

### 1.4 Stats Features

| Feature | CLI | VSCode | Gap |
|---------|-----|--------|-----|
| CPU % with sparkline | ✓ | ✓ | None |
| Memory used/limit/% with sparkline | ✓ | ✓ | None |
| Color-coded bars (CPU, Memory) | ✗ | ✓ | Platform-appropriate |
| Network I/O (cumulative bytes) | ✓ | ✓ | None |
| Network I/O rate sparklines (Rx/Tx) | ✓ | ✗ | **Gap** |
| Block I/O (cumulative bytes) | ✓ | ✓ | None |
| Block I/O rate sparklines (read/write) | ✓ | ✗ | **Gap** |
| PIDs count | ✓ | ✓ | None |
| Sparkline min/max/time labels | ✓ | ✗ | **Gap** |

### 1.5 Compose / Services

| Feature | CLI | VSCode | Gap |
|---------|-----|--------|-----|
| Label-based project detection | ✓ | ✓ | None |
| Config-based project detection | ✓ | ✓ | None |
| Hierarchical project→service display | ✓ | ✓ | None |
| Project-level + service-level actions | ✓ | ✓ | None |
| Compose log streaming | ✓ | ✓ | None |

### 1.6 UI Features

| Feature | CLI | VSCode | Gap |
|---------|-----|--------|-----|
| VI navigation (j/k/g/G) | ✓ | ✓ | None |
| Panel filter (/ key) | ✓ | ✓ | None |
| Context menu (x key) | ✓ | ✓ | None |
| Detail tab cycling ([/]) | ✓ | ✓ | None |
| Sort overlay (o key, 7 fields) | ✓ | ✗ | **Gap** |
| Sort direction toggle (R key) | ✓ | ✗ | **Gap** |
| Show all/running toggle (a key) | ✓ | ✗ | **Gap** |
| Layout modes (z key: Normal/Wide/Expanded) | ✓ | ✗ | **Gap** |
| Help overlay (? key) | ✓ | ✗ | **Gap** |
| Version overlay (V key) | ✓ | ✗ | **Gap** |
| Focus toggle (Tab key) | ✓ | ✗ | **Gap** |
| Toast: 4 severities (error/warning/info/success) | ✓ | ✗ (3: no success) | **Gap** |
| Contextual status bar hints | ✓ | ✗ (simpler bar) | **Gap** |
| Phrase rotation in tab bar | ✓ | ✓ | None |
| Mouse support (SGR 1006) | ✓ | N/A (browser) | Platform-appropriate |
| Scroll indicators (▲/▼ + counts) | ✓ | ✗ | **Minor** |

### 1.7 Platform-Specific

| Feature | CLI | VSCode | Gap |
|---------|-----|--------|-----|
| Non-dashboard commands (ps, logs) | ✓ | N/A | CLI-only |
| Tree view (sidebar) | N/A | ✓ | VSCode-only |
| Command palette commands (8) | N/A | ✓ | VSCode-only |
| Activity bar badge (running count) | N/A | ✓ | VSCode-only |
| VSCode status bar item | N/A | ✓ | VSCode-only |
| CSP nonce security | N/A | ✓ | VSCode-only |
| Zod message validation | N/A | ✓ | VSCode-only |
| Too-small terminal overlay | ✓ | N/A | CLI-only |
| q/Ctrl+C quit | ✓ | N/A | CLI-only |

---

## 2. Platform-Appropriate Differences

These differences are intentional and correct for each platform. No action needed.

| Feature | CLI Approach | VSCode Approach | Rationale |
|---------|-------------|-----------------|-----------|
| Exec shell | PTY overlay in terminal (`e` key → ExecManager) | Opens VSCode integrated terminal (`docker exec -it`) | VSCode has native terminal; embedding PTY in webview is impractical |
| Log filter UI | Dedicated overlay (f key, Tab mode toggle) | Inline filter bar in log tab header (input + mode button) | Webview can use HTML input; TUI needs full-screen overlay for text input |
| Color-coded bars | Not used (sparklines preferred in TUI) | Green/yellow/red bars for CPU/Memory (thresholds at 50%/80%) | HTML can render bars easily; TUI relies on sparkline characters |
| Mouse support | SGR 1006 raw protocol (click panels, scroll lists) | Native browser mouse events (VSCode webview) | Platform-native mouse handling |
| Tree view sidebar | N/A | `ContainerTreeProvider` with 3 groups + color icons | VSCode-specific UI pattern |
| Command palette | N/A | 8 commands (quick start/stop/restart, open dashboard, etc.) | VSCode-specific UI pattern |
| Activity bar badge | N/A | Running container count on extension icon | VSCode-specific UI pattern |
| Terminal commands | `ps` (table listing), `logs <container>` (streaming) | N/A | CLI-specific; no terminal equivalent in VSCode |
| Quit behavior | `q` / `Ctrl+C` | Close webview panel (native VSCode) | Platform-native |
| Terminal size guard | "Too small" overlay when < 60×15 | N/A | Webview is always adequately sized |
| Confirmation severity tiers | 3 visual styles (low/high/batch with different icons, borders, warnings) | Single confirm dialog style | Minor visual difference; both require explicit y/n confirmation |

---

## 3. Actionable Parity Gaps

> **Implementation Status:** All 12 gaps resolved. TypeScript compiles cleanly. See section 5 for summary.

### 3.1 Help Overlay (? key) — VSCode Missing

**Priority: HIGH** — Users need discoverability of keybindings

- **What:** CLI shows a help overlay (? key) listing all keybindings organized by category (global, panel-specific actions). VSCode has no equivalent.
- **Source files:**
  - CLI reference: `sidekick-docker-cli/src/dashboard/ink/HelpOverlay.tsx`
  - VSCode target: `sidekick-docker-vscode/src/webview/dashboard.ts` (keyboard handler + overlay rendering)
- **Complexity:** Medium
- **Implementation:** Add a `help` overlay type to the webview. Render all keybindings in a styled modal. Wire `?` key to toggle it. Populate from panel definitions (which already define actions with keys).

### 3.2 Sort Overlay (o key) with 7 Sort Fields — VSCode Missing

**Priority: HIGH** — Power users need to sort by CPU/memory/network usage

- **What:** CLI has a sort overlay (o key) with 7 sortable fields for containers: state, name, CPU%, memory%, network I/O, block I/O, PIDs. Sort direction toggleable with R key. VSCode only has fixed `sortKey` ordering (running before stopped).
- **Source files:**
  - CLI reference: `sidekick-docker-cli/src/dashboard/ink/SortOverlay.tsx`, `useKeyboardHandler.ts` (lines 198-224)
  - VSCode target: `sidekick-docker-vscode/src/webview/dashboard.ts` (sorting logic), `src/webview/panels/containers.ts` (sort fields), `src/webview/state.ts` (state additions: `sortField`, `sortReversed`)
- **Complexity:** Medium
- **Implementation:** Add `sortField` and `sortReversed` to `WebviewState`. Create sort overlay UI. Apply sort function to container list before rendering. Need stats data accessible during sort (already available in `state.stats` map).

### 3.3 Show All / Running Only Toggle (a key) — VSCode Missing

**Priority: HIGH** — Core filtering feature for containers panel

- **What:** CLI has `a` key to toggle between showing all containers and running-only. VSCode always shows all containers (grouped by state).
- **Source files:**
  - CLI reference: `sidekick-docker-cli/src/dashboard/ink/useKeyboardHandler.ts` (lines 282-286)
  - VSCode target: `sidekick-docker-vscode/src/webview/dashboard.ts`, `src/webview/state.ts` (add `showAllContainers: boolean`)
- **Complexity:** Small
- **Implementation:** Add `showAllContainers` boolean to state (default: true). Filter container list in side panel when false. Update status bar to show current mode. Wire `a` key.

### 3.4 Focus Toggle (Tab key) — VSCode Missing

**Priority: HIGH** — Essential for keyboard-only navigation

- **What:** CLI uses Tab to toggle focus between side list and detail pane. Different keys apply depending on focus (j/k scrolls list vs detail). VSCode has no focus concept — j/k always controls the side list.
- **Source files:**
  - CLI reference: `sidekick-docker-cli/src/dashboard/ink/useKeyboardHandler.ts` (lines 258-261)
  - VSCode target: `sidekick-docker-vscode/src/webview/dashboard.ts` (keyboard handler), `src/webview/state.ts` (add `focusTarget: 'side' | 'detail'`)
- **Complexity:** Medium
- **Implementation:** Add `focusTarget` to state. When focus is `detail`, j/k scrolls detail pane content. Visual indicator (highlight border or different styling) on focused pane. Tab toggles. Enter from side switches to detail. h/← from detail returns to side.

### 3.5 Async Action Feedback (In-Progress + Success Toasts) — VSCode Missing

**Priority: HIGH** — Users need feedback that operations are executing

- **What:** CLI shows three-stage feedback: (1) in-progress toast with spinner while action runs, (2) success toast on completion, (3) error toast on failure. VSCode only shows a post-completion toast (info or error) with no in-progress indicator.
- **Source files:**
  - CLI reference: `sidekick-docker-cli/src/dashboard/ink/useKeyboardHandler.ts` (lines 36-61)
  - VSCode target: `sidekick-docker-vscode/src/providers/DockerDashboardProvider.ts` (lines 153-218, action handler), `src/webview/dashboard.ts` (toast system), `src/webview/state.ts` (add `success` to toast severity)
  - Message type: `sidekick-docker-vscode/src/types/messages.ts` (toast message)
- **Complexity:** Small
- **Implementation:** (1) Add `success` severity to toast type union and `TOAST_DURATIONS`. (2) In `DockerDashboardProvider`, send an `info` toast before executing the action, then send `success` or `error` toast after. (3) Style success toast in webview CSS.

### 3.6 Network & Block I/O Rate Sparklines — VSCode Missing

**Priority: MEDIUM** — Useful for monitoring but not blocking

- **What:** CLI shows rate sparklines for Network Rx/Tx and Block Read/Write. VSCode shows only cumulative byte totals as text.
- **Source files:**
  - Shared library (already has rate series): `sidekick-docker-shared/src/stats/StatsCollector.ts` — `getNetworkRxRateSeries()`, `getNetworkTxRateSeries()`, `getBlockReadRateSeries()`, `getBlockWriteRateSeries()`
  - VSCode message protocol: `sidekick-docker-vscode/src/types/messages.ts` (needs 4 new history fields)
  - VSCode service: `sidekick-docker-vscode/src/services/DockerService.ts` (line 261-263, extract rate series)
  - VSCode provider: `sidekick-docker-vscode/src/providers/DockerDashboardProvider.ts` (pass through)
  - VSCode state: `sidekick-docker-vscode/src/webview/state.ts` (stats type needs rate history fields)
  - VSCode rendering: `sidekick-docker-vscode/src/webview/panels/containers.ts` (Stats tab, add sparklines)
- **Complexity:** Medium
- **Implementation:** Extend `updateStats` message with `networkRxRateHistory`, `networkTxRateHistory`, `blockReadRateHistory`, `blockWriteRateHistory`. Extract from `StatsCollector` in `DockerService`. Render sparklines in containers Stats tab below Network and Block I/O sections.

### 3.7 Log Activity Severity Sparkline — VSCode Missing

**Priority: MEDIUM** — Visual log trend analysis

- **What:** CLI renders a severity time-series sparkline in the Stats tab ("Log Activity" section) showing error/warn/info/debug distribution over 60 one-minute buckets. VSCode only shows static severity count badges.
- **Source files:**
  - Shared library: `sidekick-docker-shared/src/log/LogSeverityTimeSeries.ts` (already exists)
  - CLI reference: `sidekick-docker-cli/src/dashboard/panels/ContainersPanel.ts` (lines 127-132)
  - VSCode target: `sidekick-docker-vscode/src/services/DockerService.ts` (need to maintain time-series), `src/types/messages.ts` (new field in updateLogs or updateStats), `src/webview/panels/containers.ts` (Stats tab rendering)
- **Complexity:** Medium
- **Implementation:** Instantiate `LogSeverityTimeSeries` per container in `DockerService`. Push severity data on each log entry. Send time-series data to webview (either in `updateStats` or a new message). Render sparkline in Stats tab. Color each bar by dominant severity.

### 3.8 Layout Modes (z key) — VSCode Missing

**Priority: MEDIUM** — Useful for detail-focused workflows

- **What:** CLI cycles through 3 layout modes with `z`: Normal (28-char side panel), Wide (42-char), Expanded (side hidden, full-width detail). VSCode has fixed layout.
- **Source files:**
  - CLI reference: `sidekick-docker-cli/src/dashboard/ink/useKeyboardHandler.ts` (lines 263-268)
  - VSCode target: `sidekick-docker-vscode/src/webview/dashboard.ts` (keyboard handler + layout rendering), `src/webview/state.ts` (add `layoutMode`)
- **Complexity:** Small
- **Implementation:** Add `layoutMode: 'normal' | 'wide' | 'expanded'` to state. Apply CSS class to main container that adjusts side panel width (or hides it). Wire `z` key to cycle modes.

### 3.9 Version Overlay (V key) — VSCode Missing

**Priority: LOW** — Nice-to-have branding/info display

- **What:** CLI shows a version overlay (V key) with branding, version, and a random motivational phrase. VSCode shows version only in status bar.
- **Source files:**
  - CLI reference: `sidekick-docker-cli/src/dashboard/ink/VersionOverlay.tsx`
  - VSCode target: `sidekick-docker-vscode/src/webview/dashboard.ts`
- **Complexity:** Small
- **Implementation:** Add `version` overlay type. Render branding + version + rotating phrase in a styled modal. Wire `V` key.

### 3.10 Sparkline Min/Max/Time Labels — VSCode Missing

**Priority: LOW** — Extra context for sparklines

- **What:** CLI sparklines include dim min/max labels and a `← Ns` time window indicator. VSCode sparklines are bare Unicode chars.
- **Source files:**
  - CLI reference: `sidekick-docker-cli/src/formatters.ts` (`coloredSparkline()`)
  - VSCode target: `sidekick-docker-vscode/src/webview/formatters.ts` (`renderSparkline()`)
- **Complexity:** Small
- **Implementation:** Extend `renderSparkline()` to accept min/max values and render them as small labels alongside the sparkline row.

### 3.11 Contextual Status Bar Hints — VSCode Missing

**Priority: LOW** — Nice-to-have for discoverability

- **What:** CLI status bar shows contextual hints per panel (e.g., `f:Filter logs  c:Copy  a:Running only  ↕name`). VSCode status bar shows simpler static hints.
- **Source files:**
  - CLI reference: `sidekick-docker-cli/src/dashboard/ink/Dashboard.tsx` (status bar rendering)
  - VSCode target: `sidekick-docker-vscode/src/webview/dashboard.ts` (status bar section)
- **Complexity:** Small
- **Implementation:** Generate panel-specific hint strings from the active panel's action definitions. Display in the status bar center section.

### 3.12 Scroll Position Indicators — VSCode Missing

**Priority: LOW** — Minor UX polish

- **What:** CLI shows ▲/▼ scroll indicators with remaining line counts in the detail pane. VSCode has no equivalent.
- **Source files:**
  - VSCode target: `sidekick-docker-vscode/src/webview/dashboard.ts` (detail pane rendering)
- **Complexity:** Small
- **Implementation:** Track scroll position of detail content div. Show indicators when content overflows.

---

## 4. Implementation Plan

### Batch 1: Core Navigation & Feedback (High Priority)

**Goal:** Enable keyboard-first navigation parity and action feedback.

#### 1a. Focus Toggle (Tab key)
- **Files to modify:**
  - `sidekick-docker-vscode/src/webview/state.ts` — Add `focusTarget: 'side' | 'detail'` to `WebviewState`
  - `sidekick-docker-vscode/src/webview/dashboard.ts` — Handle Tab key, route j/k based on focus, visual focus indicator
- **Changes:**
  - Add `focusTarget` state field (default: `'side'`)
  - Tab key toggles `focusTarget`
  - When `focusTarget === 'detail'`: j/k scrolls detail pane, h/← returns to side
  - When `focusTarget === 'side'`: j/k navigates list, Enter switches to detail
  - Add CSS class for focused pane visual indicator (e.g., brighter border)
- **Verify:** Tab toggles focus; j/k behavior changes with focus; Enter/h navigate between panes

#### 1b. Show All / Running Only Toggle (a key)
- **Files to modify:**
  - `sidekick-docker-vscode/src/webview/state.ts` — Add `showAllContainers: boolean`
  - `sidekick-docker-vscode/src/webview/dashboard.ts` — Wire `a` key, filter container list, update status bar
- **Changes:**
  - Add `showAllContainers` state (default: `true`)
  - `a` key toggles when on Containers panel
  - Filter `state.containers` before passing to panel: when `false`, exclude non-running
  - Status bar shows "Running only" or "Show all" mode
- **Verify:** `a` toggles container visibility; stopped containers hidden/shown; status bar reflects mode

#### 1c. Async Action Feedback + Success Toast
- **Files to modify:**
  - `sidekick-docker-vscode/src/webview/state.ts` — Add `'success'` to toast severity union
  - `sidekick-docker-vscode/src/webview/dashboard.ts` — Add `TOAST_DURATIONS.success = 2000`, success toast CSS
  - `sidekick-docker-vscode/src/types/messages.ts` — Add `'success'` to toast severity in message type
  - `sidekick-docker-vscode/src/providers/DockerDashboardProvider.ts` — Send in-progress toast before action, success/error after
- **Changes:**
  - Add `success` severity with green styling and checkmark icon
  - In action handler: post `info` toast `"{actionType}…"` → execute action → post `success` toast `"{actionType}"` or `error` toast `"{actionType} failed: {error}"`
- **Verify:** Trigger container restart; see in-progress toast → success toast. Trigger action on stopped daemon; see in-progress → error toast.

### Batch 2: Sort & Layout (High/Medium Priority)

#### 2a. Sort Overlay (o key)
- **Files to modify:**
  - `sidekick-docker-vscode/src/webview/state.ts` — Add `sortField`, `sortReversed`, `sortOverlayOpen`, `sortMenuIndex`
  - `sidekick-docker-vscode/src/webview/dashboard.ts` — Sort overlay rendering, keyboard handler (o/R keys), sort logic
  - `sidekick-docker-vscode/src/webview/panels/containers.ts` — Define sortable fields (state, name, cpu, mem, net, io, pids)
- **Changes:**
  - Define `SortField = 'state' | 'name' | 'cpu' | 'mem' | 'net' | 'io' | 'pids'`
  - Add sort overlay DOM: list of fields, highlight current, ▼/▲ direction indicator
  - `o` key opens overlay; j/k navigates; Enter selects; Esc closes; `R` reverses
  - Apply sort comparator to container list using stats from `state.stats` map
  - Status bar shows active sort field + direction
- **Verify:** Open sort menu; select CPU%; containers reorder by CPU; R reverses; indicator shows in status bar

#### 2b. Layout Modes (z key)
- **Files to modify:**
  - `sidekick-docker-vscode/src/webview/state.ts` — Add `layoutMode: 'normal' | 'wide' | 'expanded'`
  - `sidekick-docker-vscode/src/webview/dashboard.ts` — Wire `z` key, apply layout CSS class
  - Webview CSS (inline in `DockerDashboardProvider.ts`) — Add layout mode classes
- **Changes:**
  - `z` cycles: normal → wide → expanded → normal
  - CSS: `.layout-normal .side-list { width: 240px }`, `.layout-wide .side-list { width: 340px }`, `.layout-expanded .side-list { display: none }`
  - Update tab bar to show layout mode indicator
- **Verify:** `z` cycles through modes; side panel width changes; expanded hides side panel

### Batch 3: Stats Enhancements (Medium Priority)

#### 3a. Network & Block I/O Rate Sparklines
- **Files to modify:**
  - `sidekick-docker-vscode/src/types/messages.ts` — Extend `updateStats` with rate history arrays
  - `sidekick-docker-vscode/src/services/DockerService.ts` — Extract rate series from `StatsCollector`
  - `sidekick-docker-vscode/src/providers/DockerDashboardProvider.ts` — Pass rate series through
  - `sidekick-docker-vscode/src/webview/state.ts` — Extend stats type with rate history fields
  - `sidekick-docker-vscode/src/webview/panels/containers.ts` — Render rate sparklines
- **Changes:**
  - Call `statsCollector.getNetworkRxRateSeries(id)`, `getNetworkTxRateSeries(id)`, `getBlockReadRateSeries(id)`, `getBlockWriteRateSeries(id)` in `DockerService`
  - Add to `updateStats` message: `networkRxRateHistory`, `networkTxRateHistory`, `blockReadRateHistory`, `blockWriteRateHistory`
  - Render sparklines below Network I/O and Block I/O text in Stats tab
- **Verify:** Select running container; see sparklines appear under Network/Block sections after a few stats samples

#### 3b. Log Activity Severity Sparkline
- **Files to modify:**
  - `sidekick-docker-vscode/src/services/DockerService.ts` — Instantiate `LogSeverityTimeSeries` per container, push on log entries
  - `sidekick-docker-vscode/src/types/messages.ts` — Add severity series to `updateStats` or `updateLogs`
  - `sidekick-docker-vscode/src/webview/state.ts` — Store severity time-series per container
  - `sidekick-docker-vscode/src/webview/panels/containers.ts` — Render in Stats tab
  - `sidekick-docker-vscode/src/webview/formatters.ts` — Add `renderSeveritySparkline()` function
- **Changes:**
  - Maintain `Map<string, LogSeverityTimeSeries>` in `DockerService`
  - On each log entry, push to time-series with detected severity
  - Send `logSeveritySeries: { total: number, dominant: string }[]` in stats update
  - Render colored sparkline: each bar colored by dominant severity (red=error, yellow=warn, blue=info, gray=debug)
- **Verify:** Select container with active logs; Stats tab shows "Log Activity" sparkline colored by severity

#### 3c. Sparkline Min/Max/Time Labels
- **Files to modify:**
  - `sidekick-docker-vscode/src/webview/formatters.ts` — Extend `renderSparkline()` to accept and render labels
  - `sidekick-docker-vscode/src/webview/panels/containers.ts` — Pass min/max/time data to sparkline renderer
- **Changes:**
  - Add optional `labels?: { min: string, max: string, timeWindow?: string }` param to `renderSparkline()`
  - Render as `<span class="sparkline-label">min</span> [sparkline] <span class="sparkline-label">max</span>`
- **Verify:** CPU/Memory sparklines show min/max values at edges

### Batch 4: Overlays & Polish (Medium/Low Priority)

#### 4a. Help Overlay (? key)
- **Files to modify:**
  - `sidekick-docker-vscode/src/webview/dashboard.ts` — Add help overlay rendering and `?` key handler
- **Changes:**
  - Add `help` to overlay types
  - Render modal with keybinding sections: Global, Navigation, Current Panel Actions
  - Pull action definitions from active panel's `getActions()` results
  - Style: keybinding badges (blue for safe, red for destructive) + action descriptions
  - Dismiss with `?` or Escape
- **Verify:** Press `?`; help overlay shows all keybindings; press Escape to dismiss

#### 4b. Version Overlay (V key)
- **Files to modify:**
  - `sidekick-docker-vscode/src/webview/dashboard.ts` — Add version overlay rendering and `V` key handler
- **Changes:**
  - Add `version` to overlay types
  - Render branding (`⚡ sidekick-docker`), version, and current rotating phrase
  - Dismiss with `V` or Escape
- **Verify:** Press `V`; version overlay shows; press Escape to dismiss

#### 4c. Contextual Status Bar Hints
- **Files to modify:**
  - `sidekick-docker-vscode/src/webview/dashboard.ts` — Enhanced status bar rendering
- **Changes:**
  - Generate hint string from active panel's available actions + panel-specific features
  - Containers panel: `f:Filter logs  c:Copy  a:{mode}  ↕{sort field}`
  - Other panels: available actions
  - Display in status bar center area
- **Verify:** Switch panels; status bar hints update to reflect current panel's available actions

#### 4d. Scroll Position Indicators
- **Files to modify:**
  - `sidekick-docker-vscode/src/webview/dashboard.ts` — Detail pane scroll tracking and indicator rendering
- **Changes:**
  - Listen to scroll events on detail content container
  - Show ▲ indicator (with count) when scrolled down from top
  - Show ▼ indicator (with count) when content below viewport
- **Verify:** Long log output; scroll indicators appear/disappear based on position

### Verification Steps (All Batches)

After each batch:
1. Run `cd sidekick-docker-vscode && npx tsc --noEmit` — must compile cleanly
2. Run `cd sidekick-docker-shared && npx tsc --noEmit` — must compile cleanly (if shared changes)
3. Manually verify no regressions in existing features by reviewing modified files
4. Confirm keyboard shortcuts don't conflict with existing bindings

After all batches:
1. Full build: `npm run build` from repo root
2. Cross-check all 12 gaps marked as resolved
3. Verify message protocol consistency (`messages.ts` types match actual usage)

---

## 5. Implementation Completion Status

All 12 parity gaps have been implemented. TypeScript compiles cleanly (`tsc --noEmit` passes for both shared and vscode packages). esbuild bundle succeeds.

| # | Gap | Status | Files Modified |
|---|-----|--------|---------------|
| 3.1 | Help overlay (? key) | **Done** | `dashboard.ts`, `DockerDashboardProvider.ts` |
| 3.2 | Sort overlay (o key, 7 fields) | **Done** | `state.ts`, `dashboard.ts`, `DockerDashboardProvider.ts` |
| 3.3 | Show all/running toggle (a key) | **Done** | `state.ts`, `dashboard.ts` |
| 3.4 | Focus toggle (Tab key) | **Done** | `state.ts`, `dashboard.ts`, `DockerDashboardProvider.ts` |
| 3.5 | Async action feedback + success toast | **Done** | `state.ts`, `messages.ts`, `dashboard.ts`, `DockerDashboardProvider.ts` |
| 3.6 | Network & Block I/O rate sparklines | **Done** | `messages.ts`, `DockerService.ts`, `DockerDashboardProvider.ts`, `state.ts`, `containers.ts` |
| 3.7 | Log activity severity sparkline | **Done** | `DockerService.ts`, `messages.ts`, `state.ts`, `containers.ts`, `formatters.ts` |
| 3.8 | Layout modes (z key) | **Done** | `state.ts`, `dashboard.ts`, `DockerDashboardProvider.ts` |
| 3.9 | Version overlay (V key) | **Done** | `dashboard.ts`, `DockerDashboardProvider.ts` |
| 3.10 | Sparkline min/max/time labels | **Done** | `formatters.ts` |
| 3.11 | Contextual status bar hints | **Done** | `dashboard.ts` |
| 3.12 | Scroll position indicators | **Done** | `dashboard.ts`, `DockerDashboardProvider.ts` |

### Summary of Changes by File

| File | Changes |
|------|---------|
| `webview/state.ts` | Added `SortField`, `LayoutMode`, `ToastSeverity` types; `ContainerStatsEntry` interface; `focusTarget`, `showAllContainers`, sort/layout/overlay state fields |
| `types/messages.ts` | Added `success` toast severity; rate history + log severity series to `updateStats` |
| `services/DockerService.ts` | Extract rate series from `StatsCollector`; maintain `LogSeverityTimeSeries` per container; push severity on each log entry; send all series in stats callback |
| `providers/DockerDashboardProvider.ts` | Async action feedback (in-progress → success/error); pass rate + severity data; HTML elements for overlays; CSS for all new features |
| `webview/formatters.ts` | `renderSparkline()` now renders min/max/time labels; added `renderSeveritySparkline()` |
| `webview/panels/containers.ts` | Stats tab renders rate sparklines for Network/Block I/O; renders log severity sparkline |
| `webview/dashboard.ts` | Focus toggle (Tab/Enter/h); show-all toggle (a); sort overlay (o/R); layout cycle (z); help overlay (?); version overlay (V); contextual hints; scroll indicators; focus-aware j/k navigation |
