# Panel System

Every resource type in the dashboard is implemented as a panel that conforms to the `SidePanel` interface.

## SidePanel Interface

Each panel implements:

| Method | Purpose |
|--------|---------|
| `getItems()` | Returns the list of resources to display in the side list |
| `detailTabs[]` | Array of tab definitions, each with a render function |
| `getActions()` | Returns per-item actions (shortcut key, `condition`, confirm metadata, handler) for the actions menu and direct shortcuts |
| `getSearchableText()` | Optional per-item text used by the `/` filter |

The interface is defined in `sidekick-docker-cli/src/dashboard/panels/types.ts`. Panels do not define keybindings themselves: global keys (including panel-contextual ones like filter, sort, and compare) live in the central registry at `sidekick-docker-cli/src/dashboard/ink/keyRegistry.ts`, while per-item action shortcuts come from `getActions()`.

## Panel Implementations

All five live in `sidekick-docker-cli/src/dashboard/panels/`.

| Panel | Class | Resources |
|-------|-------|-----------|
| Containers | `ContainersPanel` | Docker containers |
| Services | `ServicesPanel` | Compose projects and services |
| Images | `ImagesPanel` | Local images |
| Volumes | `VolumesPanel` | Named volumes |
| Networks | `NetworksPanel` | Docker networks |

## State Management

The main `Dashboard` component uses `useReducer` for UI state (selected panel, selected item, focus area, filter text, modal state). Input handling is delegated to `useKeyboardHandler` and `useMouseHandler` hooks, with global keybindings defined in `keyRegistry.ts`.

Domain state (the actual Docker resources) lives in the `DockerState` class, which:

1. Delegates the resource lists (containers, images, volumes, networks, compose projects), refreshes and Docker event handling to the shared `DockerStateStore` — the same store the VS Code extension uses
2. Adds the TUI-only buffers: log rings, lazily fetched detail caches (inspect details, filesystem changes, image layers) and the stats collector
3. Notifies the dashboard through a change callback only when something actually changed, which calls `scheduleRender()`

Panels gate their actions with `condition` and word confirmations through shared helpers (`canStart`, `canStop`, `pruneConfirmMessage`, `removeContainerConfirmMessage`) so the TUI and the VS Code webview offer the same actions with the same wording.

## Rendering Flow

```mermaid
sequenceDiagram
    participant E as EventWatcher
    participant DS as DockerState
    participant D as Dashboard
    participant P as Active Panel

    E->>DS: processEvent(event)
    DS->>DS: DockerStateStore patches or schedules a refresh
    DS->>D: onChange → scheduleRender()
    D->>P: getItems()
    P-->>D: Updated resource list
    D->>D: Re-render UI
```
