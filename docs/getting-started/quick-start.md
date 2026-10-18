# Quick Start

This guide walks you through launching Sidekick Docker and exploring its main features.

## Launch the Dashboard

```bash
sidekick-docker
```

The dashboard opens with the **Containers** panel selected. You'll see all containers (running and stopped) listed on the left, with detail tabs on the right.

!!! tip
    Make sure Docker is running before launching. Sidekick Docker connects to your local Docker socket by default.

## Navigate the Panels

Switch between the five panels using number keys:

| Key | Panel |
|-----|-------|
| `1` | Containers |
| `2` | Compose Services |
| `3` | Images |
| `4` | Volumes |
| `5` | Networks |

## Browse Resources

- **`j`** / **`k`** — move up and down the list
- **`Enter`** or **`Tab`** — focus the detail pane
- **`[`** / **`]`** — cycle through detail tabs (Logs, Stats, Env, Config, Labels, Files, Patterns)
- **`Esc`** or **`h`** — back to the side list

## View Logs and Stats

1. Select a running container with `j`/`k`
2. Press `Enter` to focus the detail pane
3. The **Logs** tab streams live output
4. Press `]` to switch to **Stats** — CPU and memory sparklines update in real time

## Take Actions

Press **`x`** to open the context menu for the selected item, or press an action's key directly (the menu shows each key). Available actions depend on the resource type and its current state:

- **Containers**: Start, Stop, Restart, Pause/Unpause, Remove, Exec, Open in Browser (`b`, for a published port), Copy Logs, Prune
- **Compose projects**: Up, Down, Restart, Stop
- **Images/Volumes/Networks**: Remove, Prune

All destructive actions show a confirmation modal before executing.

## Filter the List

Press **`/`** to open the filter bar. Type to narrow the list by name. Press **`Esc`** to clear.

## Get Help

Press **`?`** at any time to see the full keybinding reference overlay (scroll it with `j`/`k` if it does not fit). Press **`Ctrl+R`** to refresh everything immediately.

## Next Steps

- [Dashboard Overview](../features/dashboard.md) — panel system in detail
- [Keybindings](../features/keybindings.md) — complete keyboard reference
- [CLI Commands](../features/cli-commands.md) — non-interactive commands (`ps`, `logs`, `images`, `volumes`, `networks`, `stats`, `df`, `inspect`)
