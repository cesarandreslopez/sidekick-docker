# Demo recordings

Scripts that record the GIFs and screenshots in the READMEs and on the docs site. They drive the real products, the `sidekick-docker` TUI in a terminal and the VS Code extension, against an invented "storefront" stack on a Docker daemon of their own, so nothing from your machine appears on screen. This folder is a private package: it is not published and none of the three shipped packages depend on it. The approach and most of the rig come from `sidekick-agent-hub/demo`.

## Regenerate everything

Prerequisites (macOS): Node.js 22+, Docker Desktop (or another local Docker), VS Code in `/Applications`, the Xcode Command Line Tools (`xcode-select --install`, for `swift encode.swift`), and `brew install ttyd gifski pngquant jq`. The products must be built first (`npm run build` from the repo root).

```bash
cd demo
npm install
node record.mjs        # the three clips → out/<clip>/final/{<clip>.gif,<clip>.mp4,stills/}
node shots.mjs         # extra stills for the docs → out/screenshots/final/stills/
node social.mjs        # out/social-preview.png for GitHub → Settings → Social preview (upload by hand)
node review.mjs        # out/review.html: every clip, still and the GIF it replaces, for a human look
node sync.mjs          # approved files → assets/demo/v1/ and docs/images/demo/v1/
```

`node record.mjs cli-dashboard` records one clip (`cli-dashboard`, `cli-logs`, `vscode-tour`). `node lib/stack.mjs` starts the sandbox daemon and seeds the stack without recording; look around with `docker -H tcp://127.0.0.1:2375 ps -a`. `record.mjs` and `shots.mjs` stop the daemon when they finish (pass `--keep-daemon` while iterating); by hand, `docker rm -f sidekick-demo-dind && docker network rm sidekick-demo` stops it, and `docker volume rm sidekick-demo-dind` drops its image cache.

Pass private names you never want on screen through `SK_DEMO_FORBIDDEN=name1,name2` (never write them into this folder). **Always look at every frame before syncing.** The leak check reads on-screen text only.

## How it works

| Piece | What it does |
| --- | --- |
| `stack/` | The storefront stack: `compose.yaml` (web, api ×3, worker ×2, db, cache, payments with a failing healthcheck, a paused reports service, a crash-looping mailer, a migration that exits 3, an OOM-killed cache warmer, a declared-but-not-created search service), the one small Node program that plays every app service (`app/app.js`, plain-text logs shaped for the highlighter and the pattern grouping), and a second, stopped project (`status/`). |
| `lib/sandbox.mjs` | The sandbox: `docker:29-dind` on `127.0.0.1:2375` only and on a network of its own (checked to be that container before anything destructive), a neutral home at `/tmp/acme-docker` (a non-empty folder without the rig's marker is refused), a bare `DOCKER_CONFIG` with only the compose plugin linked in, and the CLI installed from its own `npm pack` tarball (so exec falls back to `docker exec -it`, as an npm install does). The dashboard always gets `--socket tcp://127.0.0.1:2375`, which keeps your socket path out of the footage. |
| `lib/stack.mjs` | Wipes the sandbox daemon, seeds the stack plus a stopped export container, a dangling image, an anonymous volume and an unused network, waits until every container is in its demo state, then runs the preflight (states, `compose config`, `docker diff`, stats). Every take starts from a fresh seed. |
| `lib/terminal.mjs` | The real TUI in ttyd/xterm.js inside Chromium, at 2560×1440 CSS px with a bundled font, plus a caption band under the terminal. |
| `lib/tui.mjs` | Waiting for on-screen text, keycap presses, and selecting rows by name (the list order inside a state group changes between seeds). |
| `lib/vscode.mjs` | The real VS Code under Playwright's Electron driver, with the packaged `.vsix` installed into the sandbox's own extensions folder, fresh user data and seeded settings (`socketPath` points at the sandbox daemon; menus are DOM menus so they can be recorded and clicked). |
| `lib/overlay.mjs` | Captions, keycap chips and a drawn pointer with click ripples (the real pointer never shows in a screencast). |
| `lib/recorder.mjs`, `encode.swift` | CDP screencast frames with their arrival times → an MP4 with eased camera moves cropped from the 2× frames, PNG stills, and a gifski GIF that fades back to its first frame so it loops cleanly. |
| `lib/leakcheck.mjs` | Fails a take if on-screen text, sampled at every beat and every second in between, contains your username, home or hostname, any `/Users/` path, Docker Desktop's socket or context, a non-example.com email, or a name from `SK_DEMO_FORBIDDEN`. VS Code's integrated terminal draws to a canvas, so its text is not sampled. |
| `directors/*.mjs` | One script per clip (and one for the stills): the beats, keys, clicks, captions and camera. See `STORYBOARD.md`. |

## Rules

- **No voiceovers.** Captions only, five words or fewer, in the band under the terminal or over the editor.
- **Frame 0 is the poster.** Every clip starts on a busy, populated screen, because a GIF shows its first frame before it plays.
- **Nothing real on screen.** Only the sandbox daemon, `example.com` hosts and the `storefront` stack.
- **4 MB per GIF.** Camera moves are what make a GIF heavy (every pixel changes while the view eases), so use them only where text would otherwise be unreadable.
- **Versioned folders.** A new set of recordings goes to `v2/`. Never rename or delete old files under `assets/` (including the legacy `assets/*.gif`): every published README (npm, Open VSX) keeps loading the files that existed when it shipped.
- **Re-record for UI changes.** When a release changes what the dashboard or the extension look like, re-run this folder before the release, after the version bump (the status bars show the version).
