# Quick Start

This guide walks you through launching Sidekick Docker and exploring its main features.

## Launch the Dashboard

```bash
sidekick-docker
```

The dashboard opens with the **Containers** panel selected. You'll see all containers (running and stopped) listed on the left, with detail tabs on the right.

!!! tip
    Make sure Docker is running before launching. Sidekick Docker connects to `DOCKER_HOST` when it is set, otherwise to your local Docker socket. Use `--socket` to pick another endpoint (see [Docker Socket](../configuration/docker-socket.md)).

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
- **`z`** — cycle the layout (Normal, Wide, Expanded); **`w`** wraps long lines

The mouse works too: click to select, scroll, right-click for the actions menu. While the dashboard captures the mouse, most terminals cannot select text; press **`M`** to turn capture off, copy what you need, and press `M` again.

## View Logs and Stats

1. Select a running container with `j`/`k`
2. Press `Enter` to focus the detail pane
3. The **Logs** tab streams live output
4. Press `]` to switch to **Stats** — CPU and memory sparklines update in real time

To read two log streams side by side, press **`m`** on a container to pin it, then select another one: the Logs tab shows both. Press `m` or `Esc` to end the comparison. The same works for Compose services.

## Take Actions

Press **`x`** to open the context menu for the selected item, or press an action's key directly (the menu shows each key). Available actions depend on the resource type and its current state:

- **Containers**: Start, Stop, Restart, Pause/Unpause, Remove, Exec, Open in Browser (`b`, for a published port), Copy Logs, Prune
- **Compose projects and services**: Up, Down, Restart, Stop, Copy Logs
- **Images/Volumes/Networks**: Remove, Prune

All destructive actions show a confirmation modal before executing.

## Filter the List

Press **`/`** to open the filter bar. The list narrows as you type:

- containers match on name, image or state
- Compose rows match on project, service or image
- images match on any of their tags
- volumes and networks match on name or driver

`Enter` closes the bar and keeps the filter; **`Esc`** clears it.

## Get Help

Press **`?`** at any time to see the full keybinding reference overlay (scroll it with `j`/`k` if it does not fit). Press **`Ctrl+R`** to refresh everything immediately, and **`q`** to quit.

## Next Steps

- [Dashboard Overview](../features/dashboard.md) — panel system in detail
- [Keybindings](../features/keybindings.md) — complete keyboard reference
- [CLI Commands](../features/cli-commands.md) — non-interactive commands (`ps`, `logs`, `images`, `volumes`, `networks`, `stats`, `df`, `inspect`)
