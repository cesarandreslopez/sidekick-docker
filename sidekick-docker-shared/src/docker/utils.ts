/** Length of a short Docker container/image ID. */
export const CONTAINER_ID_LENGTH = 12;

/** Truncate a Docker ID to its short form (12 characters). */
export function shortId(id: string): string {
  return id.substring(0, CONTAINER_ID_LENGTH);
}
