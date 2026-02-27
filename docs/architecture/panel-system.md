# Panel System

Every resource type in the dashboard is implemented as a panel that conforms to the `SidePanel` interface.

## SidePanel Interface

Each panel implements:

| Method | Purpose |
|--------|---------|
| `getItems()` | Returns the list of resources to display in the side list |
| `detailTabs[]` | Array of tab definitions, each with a render function |
| `getActions()` | Returns context menu actions for the selected item |
| `getKeybindings()` | Optional panel-specific keybindings |

The interface is defined in `sidekick-docker-cli/src/dashboard/panels/types.ts`.

## Panel Implementations

| Panel | File | Resources |
|-------|------|-----------|
| Containers | `ContainerPanel` | Docker containers |
| Services | `ComposePanel` | Compose projects and services |
| Images | `ImagePanel` | Local images |
| Volumes | `VolumePanel` | Named volumes |
| Networks | `NetworkPanel` | Docker networks |

## State Management

The main `Dashboard` component uses `useReducer` for UI state (selected panel, selected item, focus area, filter text, modal state).

Domain state (the actual Docker resources) lives in the `DockerState` class, which:

1. Holds the current lists of containers, images, volumes, networks, and compose projects
2. Exposes methods to refresh individual resource types
3. Processes Docker events to update resources incrementally
4. Calls `scheduleRender()` to notify the UI of changes

## Rendering Flow

```mermaid
sequenceDiagram
    participant E as EventWatcher
    participant DS as DockerState
    participant D as Dashboard
    participant P as Active Panel

    E->>DS: processEvent(event)
    DS->>DS: Update resource list
    DS->>D: scheduleRender()
    D->>P: getItems()
    P-->>D: Updated resource list
    D->>D: Re-render UI
```
