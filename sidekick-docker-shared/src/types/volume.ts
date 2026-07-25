export interface VolumeInfo {
  name: string;
  driver: string;
  mountpoint: string;
  created: Date;
  isInUse: boolean;
  /**
   * Names of containers mounting this volume. The usage scan already had to
   * identify them to compute `isInUse`; keeping them answers "what is holding
   * this?" before you try to remove it.
   */
  usedBy: string[];
}
