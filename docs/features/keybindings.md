# Keybindings

Complete keyboard reference for the Sidekick Docker TUI dashboard.

## Navigation

| Key | Action |
|-----|--------|
| `j` / `Down` | Move down |
| `k` / `Up` | Move up |
| `g` | Jump to top |
| `G` | Jump to bottom |
| `Tab` | Toggle focus between side list and detail pane |
| `Enter` | Focus detail pane |
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

## Compose Actions (via context menu)

| Key | Action |
|-----|--------|
| `u` | Up (start project) |
| `d` | Down (stop project) |
| `r` | Restart |
| `S` | Stop |
| `c` | Copy logs to clipboard |

## Overlay Keyboard Hints

Interactive overlays display inline keyboard hints:

| Overlay | Hints Shown |
|---------|-------------|
| **Context Menu** | `j`/`k` select, `Enter` run, `Esc` close |
| **Sort Menu** | `j`/`k` select, `Enter` apply, `R` reverse, `Esc` close |
| **Confirmation Modal** | `y`/`n` buttons, `Esc` to cancel |
| **Filter Overlay** | `Enter` to apply, `Esc` to cancel |
| **Log Filter Overlay** | `Tab` to toggle mode, `Esc` to clear |
| **Detail Tab Bar** | `[`/`]` cycle tabs |
