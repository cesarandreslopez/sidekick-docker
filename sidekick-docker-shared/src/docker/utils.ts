/** Length of a short Docker container/image ID. */
export const CONTAINER_ID_LENGTH = 12;

/** Truncate a Docker ID to its short form (12 characters). */
export function shortId(id: string): string {
  return id.substring(0, CONTAINER_ID_LENGTH);
}

/** Docker's placeholder tag for an image with no tags. */
export const UNTAGGED_IMAGE = '<none>:<none>';

/** An image's tags without the `<none>:<none>` placeholder; empty when untagged. */
export function realImageTags(tags: readonly string[] | null | undefined): string[] {
  return (tags ?? []).filter(t => t && t !== UNTAGGED_IMAGE);
}
