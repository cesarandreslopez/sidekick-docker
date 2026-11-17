# Volumes Panel

The Volumes panel (press `4`) shows all Docker volumes, named and anonymous.

## List Columns

Each volume row displays:

- Volume name
- Driver
- Usage status (whether any container references it)

The mount path is shown in the Info tab rather than the row.

## Detail Tabs

### Info

Name, driver, mount point, creation time, and whether it is in use — including
the names of the containers mounting it.

## Actions

Press `x` to open the context menu, or press `d` (Remove) / `P` (Prune) directly:

| Action | Description |
|--------|-------------|
| Remove | Remove the selected volume. Offered only for volumes no container uses; the confirmation warns `Its data is deleted.` |
| Prune | Remove unused anonymous volumes. Since Docker Engine 23 a prune keeps named volumes, and the confirmation counts and says so; on older engines it removes every unused volume. When the list proves there is nothing to remove it says so instead of asking. If the engine's version cannot be read, the prompt is `Prune unused volumes?` with no count, and it always asks |

Prune reports the total space reclaimed.
