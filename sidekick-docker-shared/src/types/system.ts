/** Aggregate disk usage, as reported by `docker system df`. */
export interface DiskUsage {
  /** Total size of all image layers on disk. */
  imagesSize: number;
  /** Writable-layer size across all containers. */
  containersSize: number;
  volumesSize: number;
  buildCacheSize: number;
  /** Build cache not referenced by any image, i.e. safe to reclaim. */
  buildCacheReclaimable: number;
  /** Sum of the four figures above. */
  totalSize: number;
}
