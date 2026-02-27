# Images Panel

The Images panel (press `3`) shows all local Docker images.

## List Columns

Each image row displays:

- Repository and tag
- Image ID (short)
- Size (formatted)
- Age (created timestamp)

## Detail Tabs

### Info

Full image details including labels, architecture, OS, layers, and creation date.

## Actions

Press `x` to open the context menu:

| Action | Description |
|--------|-------------|
| Remove | Remove the selected image (confirmation required) |
| Prune | Remove all dangling (untagged) images (confirmation required) |

Prune reports the total space reclaimed.
