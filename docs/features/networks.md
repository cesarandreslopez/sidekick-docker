# Networks Panel

The Networks panel (press `5`) shows Docker networks.

## List Columns

Each network row displays:

- Network name
- Driver (bridge, host, overlay, etc.)
- Scope (local, swarm)
- Connected containers count

## Detail Tabs

### Info

Network details including subnet, gateway, IPAM configuration, labels, and a list of connected containers with their IP addresses.

## Actions

Press `x` to open the context menu:

| Action | Description |
|--------|-------------|
| Remove | Remove the selected network (confirmation required) |
| Prune | Remove all unused networks (confirmation required) |

!!! warning
    Built-in networks (`bridge`, `host`, `none`) cannot be removed.
