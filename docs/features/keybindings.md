# Keybindings

Complete keyboard reference for the Sidekick Docker TUI dashboard.

## Navigation

| Key | Action |
|-----|--------|
| `j` / `Down` | Move down |
| `k` / `Up` | Move up |
| `g` | Jump to top |
| `G` | Jump to bottom (resumes log follow) |
| `PgUp` / `PgDn` | Page up / down |
| `Ctrl+U` / `Ctrl+D` | Half page up / down |
| `Tab` | Toggle focus between side list and detail pane |
| `Enter` / `l` / `Right` | Focus detail pane |
| `Esc` | Back to side list / close overlay / clear filter |
| `h` / `Left` | Back to side list (when in detail pane) |

## Panels & Tabs

| Key | Action |
|-----|--------|
| `1`-`5` | Switch to panel |
| `[` / `]` | Cycle detail tab left / right |

## Actions

| Key | Action |
|-----|--------|
| `x` | Open context menu (actions for selected item) |
| `f` | Open log filter (when on Logs tab) |
| `/` | Open filter |
| `a` | Toggle all/running containers (Containers panel) |
| `o` | Open sort menu (Containers panel) |
| `R` | Reverse sort direction (Containers panel) |
| `m` | Pin/unpin item for log comparison (Containers/Services) |
| `J` / `K` | Scroll compare pane (when in detail focus) |
| `z` | Cycle layout (Normal/Wide/Expanded) |
| `?` | Show help overlay |
| `V` | Show version |
| `q` / `Ctrl+C` | Quit |

## Container Actions (via context menu)

| Key | Action |
|-----|--------|
| `s` | Start |
| `S` | Stop |
| `r` | Restart |
| `p` | Pause |
| `u` | Unpause |
| `d` | Remove (with confirmation) |
| `e` | Exec into container |
| `c` | Copy logs to clipboard |
| `P` | Prune — remove all stopped containers (with confirmation) |

Exec sessions detach with `Ctrl+]`.

## Image, Volume and Network Actions (via context menu)

| Key | Action |
|-----|--------|
| `d` | Remove the selected image / volume / network (with confirmation) |
| `P` | Prune — remove all dangling images, unused volumes, or unused networks |

Remove is offered only where it can succeed: volumes that are not in use, and
networks that are neither built-in nor still attached to a container.

## Compose Actions (via context menu)

| Key | Action |
|-----|--------|
| `u` | Up (start project) |
| `D` | Down (stop project, with confirmation) |
| `r` | Restart |
| `S` | Stop |
| `c` | Copy logs to clipboard |

## Mouse

| Gesture | Action |
|---------|--------|
| Click item | Select it (side list) or focus the detail pane |
| Click panel tab / detail tab | Switch panel / detail tab |
| Click overlay buttons | Activate them (clicks outside an overlay dismiss it) |
| Right-click item | Open the actions menu for it |
| Scroll wheel | Scroll the pane under the cursor; scrolling up in a logs tab pauses follow — scroll back to the bottom or press `G` to resume |

## Overlay Keyboard Hints

Interactive overlays display inline keyboard hints:

| Overlay | Hints Shown |
|---------|-------------|
| **Context Menu** | `j`/`k` select, `Enter` run, `Esc` close |
| **Sort Menu** | `j`/`k` select, `Enter` apply, `R` reverse, `Esc` close |
| **Confirmation Modal** | `y` confirms; `n` / `Esc` / `Enter` / `q` cancel (Enter is deliberately the safe default) |
| **Filter Overlay** | `Enter` to apply, `Esc` to cancel |
| **Log Filter Overlay** | `Tab` to toggle mode, `Esc` to clear |
| **Detail Tab Bar** | `[`/`]` cycle tabs |
