# Images Panel

The Images panel (press `3`) shows all local Docker images.

## List Columns

Each image row displays:

- Repository and tag
- Size (formatted)

The image ID and creation time are shown in the Info tab rather than the row.

## Detail Tabs

### Info

Full image details including ID, tags, size, creation date, and dangling status.

### Layers

Shows the full layer history of the image, similar to `docker history`. Each layer displays:

- **Layer number** — position in the layer stack (1 = oldest)
- **Size** — disk space consumed by the layer (0 B for metadata-only layers like ENV, LABEL)
- **Command** — the Dockerfile instruction that created the layer (e.g., `RUN apt-get install`, `COPY . /app`)

The `/bin/sh -c #(nop)` prefix is automatically stripped for cleaner display. A summary at the bottom highlights the largest layer.

## Actions

Press `x` to open the context menu:

| Action | Description |
|--------|-------------|
| Remove | Remove the selected image (confirmation required) |
| Prune | Remove all dangling (untagged) images (confirmation required) |

Prune reports the total space reclaimed.
