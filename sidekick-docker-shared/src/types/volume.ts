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
  /** Created without a name (labelled `com.docker.volume.anonymous` by Engine 23+). */
  anonymous: boolean;
  /**
   * What a default `docker volume prune` removes on this daemon: since API 1.42
   * (Engine 23) only anonymous volumes, before that every unused one. `unknown`
   * when the daemon version could not be read. The same for every volume of a
   * listing; carried per volume so the browser-safe prune wording can read it.
   */
  pruneScope: VolumePruneScope;
}

export type VolumePruneScope = 'anonymous' | 'all' | 'unknown';
