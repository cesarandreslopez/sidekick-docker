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
- **`[`** / **`]`** — cycle through detail tabs (Logs, Stats, Env, Config, Files, Patterns)
- **`Esc`** or **`h`** — back to the side list

## View Logs and Stats

1. Select a running container with `j`/`k`
2. Press `Enter` to focus the detail pane
3. The **Logs** tab streams live output
4. Press `]` to switch to **Stats** — CPU and memory sparklines update in real time

## Take Actions

Press **`x`** to open the context menu for the selected item. Available actions depend on the resource type:

- **Containers**: Start, Stop, Restart, Remove, Exec
- **Compose projects**: Up, Down, Restart, Stop
- **Images/Volumes/Networks**: Remove, Prune

All destructive actions show a confirmation modal before executing.

## Filter the List

Press **`/`** to open the filter bar. Type to narrow the list by name. Press **`Esc`** to clear.

## Get Help

Press **`?`** at any time to see the full keybinding reference overlay.

## Next Steps

- [Dashboard Overview](../features/dashboard.md) — panel system in detail
- [Keybindings](../features/keybindings.md) — complete keyboard reference
- [CLI Commands](../features/cli-commands.md) — non-interactive commands (`ps`, `logs`)
