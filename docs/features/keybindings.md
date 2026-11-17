# Keybindings

Complete keyboard reference for the Sidekick Docker TUI dashboard.

## Navigation

| Key | Action |
|-----|--------|
| `j` / `Down` | Move down (holding the key keeps moving, even when the terminal batches the repeats) |
| `k` / `Up` | Move up |
| `g` / `Home` | Jump to top |
| `G` / `End` | Jump to bottom. While log follow is paused, `G` resumes it first, wherever focus is |
| `PgUp` / `PgDn` | Page up / down |
| `Ctrl+U` / `Ctrl+D` | Half page up / down |
| `Tab` | Toggle focus between side list and detail pane |
| `Enter` / `l` / `Right` | Focus detail pane |
| `Esc` | Close an overlay; otherwise clear the filter, then end a log comparison, then go back to the side list |
| `h` / `Left` | Back to side list (when in detail pane) |

## Panels & Tabs

| Key | Action |
|-----|--------|
| `1`-`5` | Switch to panel |
| `[` / `]` | Cycle detail tab left / right |

## Global Keys

| Key | Action |
|-----|--------|
| `x` | Open the actions menu for the selected item |
| `f` | Open log filter (when on Logs tab) |
| `/` | Open filter |
| `a` | Toggle all/running containers (Containers panel) |
| `o` | Open sort menu (Containers panel) |
| `R` | Reverse sort direction (Containers panel) |
| `m` | Pin the item for log comparison (Containers/Services); while comparing, `m` (or `Esc`) ends it |
| `J` / `K` | Scroll the pinned comparison pane (while comparing) |
| `z` | Cycle layout (Normal/Wide/Expanded) |
| `M` | Toggle mouse capture. Off lets the terminal select and copy text (`--no-mouse` starts with it off) |
| `w` | Wrap long lines in the detail pane instead of cutting them off (not in compare mode) |
| `Ctrl+R` | Refresh now (the status bar shows `(Ctrl+R)` once the last refresh is a minute old) |
| `?` | Show help overlay |
| `V` | Show version |
| `q` / `Ctrl+C` | Quit |

Letter keys ignore `Ctrl` and `Alt`: `Ctrl+Z`, `Ctrl+Q` or `Alt+x` do nothing rather than running `z`, `q` or `x`. Only the chords listed here (`Ctrl+R`, `Ctrl+D`/`Ctrl+U`, `Ctrl+C`) act. While the terminal is too small for the dashboard, only `q` and `Ctrl+C` work.

## Item Actions

The keys below work directly on the selected item — the `x` menu lists the same
actions with their keys. Only actions that apply to the item's current state are
offered; others are ignored.

### Containers

| Key | Action |
|-----|--------|
| `s` | Start (stopped or created containers) |
| `S` | Stop (running, paused or restarting containers) |
| `r` | Restart |
| `p` | Pause |
| `u` | Unpause |
| `d` | Remove (with confirmation; a running container is force-stopped first, and the prompt says so) |
| `e` | Exec into container |
| `b` | Open a published port in the browser (running containers with a published TCP port) |
| `c` | Copy logs to clipboard (what the Logs tab shows, respecting the log filter) |
| `P` | Prune — remove all stopped containers (confirmation names the count; with no stopped containers it says so instead of asking) |

Embedded exec sessions detach with `Ctrl+]`; ending the shell (`exit` / `Ctrl+D`) also returns to the dashboard, and `Ctrl+C` goes to the shell. Without the embedded terminal (npm installs), `e` hands the terminal to `docker exec -it` and prints which container you are in; `exit` returns to the dashboard.

### Images, Volumes and Networks

| Key | Action |
|-----|--------|
| `d` | Remove the selected image / volume / network (with confirmation) |
| `P` | Prune — remove dangling images, unused anonymous volumes (Engine 23+ keeps named ones), or unused networks (confirmation names the count; when the list proves there is nothing to remove it says so instead of asking — any untagged image or non-default network still asks, since the daemon may prune it) |

Remove is offered only where it can succeed: volumes that are not in use, and
networks that are neither built-in nor still attached to a container.

### Compose

| Key | Action |
|-----|--------|
| `u` | Up project — `docker compose up -d` for the whole project, from any of its rows |
| `D` | Down project — `docker compose down`: removes the project's containers and networks, keeps volumes (with confirmation) |
| `r` | Restart |
| `S` | Stop |
| `c` | Copy logs to clipboard |

## Help Overlay

`?` lists every global key (with all its aliases, e.g. `j/k ↑/↓`) and the active
panel's actions. It switches to two columns on wide terminals (96+ columns) and
scrolls when it does not fit: `j`/`k` or arrows, `PgUp`/`PgDn` or `Ctrl+D`/`Ctrl+U`,
`g`/`G`. `?`, `q` or `Esc` closes it. The `?:Help` hint stays in the status bar at
any width.

## Mouse

| Gesture | Action |
|---------|--------|
| Click item | Select it (side list) or focus the detail pane |
| Click panel tab / detail tab | Switch panel / detail tab |
| Click overlay buttons | Activate them (clicks outside an overlay dismiss it) |
| Right-click item | Open the actions menu for it |
| Scroll wheel | Over the list: move the selection. Over the details: scroll them; scrolling up in a logs tab pauses follow — scroll back to the bottom or press `G` to resume. In compare mode, the column under the pointer scrolls. In the help overlay: scroll it |

## Overlay Keyboard Hints

Interactive overlays display inline keyboard hints:

| Overlay | Hints Shown |
|---------|-------------|
| **Context Menu** | `j`/`k` select, `Enter` run, `Esc` close |
| **Sort Menu** | `j`/`k` select, `Enter` apply, `R` reverse, `Esc` close |
| **Confirmation Modal** | `y` confirms; `n` / `Esc` / `Enter` / `q` cancel (Enter is deliberately the safe default) |
| **Filter Overlay** | `Enter` to apply, `Esc` to cancel |
| **Log Filter Overlay** | `Tab` to toggle mode, `Esc` to clear (pasted line breaks and tabs are dropped from both filter prompts) |
| **Detail Tab Bar** | `[`/`]` cycle tabs |
