# Storyboard

Silent clips, captions of five words or fewer, first frame busy. The storefront stack runs during every take (the load generator keeps the api busy), so the logs and stats move on camera.

## `cli-dashboard` (hero, about 20 s)

Root README hero, npm README, docs home and dashboard docs. Wide layout (`z`), `storefront-api-1` selected before recording.

| Beat | On screen | Keys | Caption | Camera |
| --- | --- | --- | --- | --- |
| 1 | Every container in its state (healthy, unhealthy, paused, exited), api-1's logs streaming with highlighting | — | Every container, live | wide |
| 2 | `storefront-payments-1` → Config tab: "unhealthy · N failing checks in a row", "Last check: exit 1 — upstream pay.example.com timed out after 5s" | `j`…, `]` ×3 | Why it's unhealthy | in on the detail pane |
| 3 | Services: storefront 7/12, api 3/3, worker 2/2, search 0/0 (not created), the stopped status-page project | `2`, `j` `j` | Compose-aware | wide |
| 4 | Prune: "Remove 5 stopped containers?", then "Pruned 5 containers — 48 MB reclaimed" | `1`, `P`, `y` | Prune, safely | wide |

## `cli-logs` (about 17 s)

Root README terminal section, containers docs. Wide layout, `storefront-api-1` selected, a minute of logs behind it.

| Beat | On screen | Keys | Caption |
| --- | --- | --- | --- |
| 1 | The log filter re-filtering on every keystroke: matches highlighted, "N matches (exact)", the E/W/I/D counts | `f`, `error`, `⏎` | Filter as you type |
| 2 | Patterns: "INFO http <*> <*> -> <*> in <*>", the JSON and logfmt shapes, with counts | `[` | Repeated lines, grouped |
| 3 | Compare in Expanded layout: payments' charge timeouts beside the api's authorisation failures | `]`, `m`, `/` `payments` `⏎`, `z` | Two streams, side by side |

No camera moves: the full frame reads at README size, and zooms are what push a GIF over budget. The list filter jumps straight to payments for the compare: stepping down the list would flash other containers' lines under the next name.

## `vscode-tour` (about 23 s)

Root README VS Code section, Open VSX README, docs home and VS Code docs. Before recording: the Containers tree is open with the storefront group expanded, the dashboard is open in Wide layout, and the Stats tab has been open for about 25 seconds so its sparklines have some history.

| Beat | On screen | Pointer / keys | Caption | Camera |
| --- | --- | --- | --- | --- |
| 1 | The tree (Running/Stopped, the storefront compose group) beside the dashboard with api-1's logs | hidden | Same dashboard, in VS Code | wide |
| 2 | Stats: bars and sparklines | clicks Stats | CPU and memory, live | wide |
| 3 | Back to Logs (a restart resets the CPU counter, which would show a negative reading on Stats); right-click storefront → Compose Restart; Output: Show Output Channels → Sidekick Docker; `Container … Started` lines and "Restarted storefront" | clicks Logs, right-clicks, clicks, `⌘⇧P` | Compose from the tree | in on the output panel |
| 4 | `e` on api-1 opens "Exec: storefront-api-1"; `ls /app` | clicks the row, `e` | A shell, one key | wide |

## Stills (`shots.mjs`)

Captured from the same stack: the Stats tab with full sparklines, the Files tab (A/C/D), the help overlay, image layers, the exec fallback an npm install sees, `sidekick-docker df`, and `ps --format json | jq`. The clips add their own stills (containers, health, services, prune, filter, patterns, compare, and the four VS Code beats).
