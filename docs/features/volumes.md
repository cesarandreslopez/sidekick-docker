# Volumes Panel

The Volumes panel (press `4`) shows named Docker volumes.

## List Columns

Each volume row displays:

- Volume name
- Driver
- Mount path
- Usage status (whether any container references it)

## Detail Tabs

### Info

Volume details including driver, mount point, labels, and scope.

## Actions

Press `x` to open the context menu:

| Action | Description |
|--------|-------------|
| Remove | Remove the selected volume (confirmation required) |
| Prune | Remove all unused volumes (confirmation required) |

Prune reports the total space reclaimed.
