# Networks Panel

The Networks panel (press `5`) shows Docker networks.

## List Columns

Each network row displays:

- Network name
- Connected containers count

Driver, scope and addressing are shown in the Info tab rather than the row.

## Detail Tabs

### Info

Identity (ID, name, driver, scope, whether it is a default network, and the
`internal` / `attachable` flags), addressing (IPAM driver plus each address
pool's subnet, gateway and IP range), the connected containers with their IPv4
addresses, and any labels.

Attachments are derived from the container listing: Docker's `GET /networks`
does not include them.

## Actions

Press `x` to open the context menu, or press `d` (Remove) / `P` (Prune) directly:

| Action | Description |
|--------|-------------|
| Remove | Remove the selected network (confirmation required) |
| Prune | Remove all unused networks (the confirmation names how many) |

!!! warning
    Built-in networks (`bridge`, `host`, `none`) cannot be removed.
