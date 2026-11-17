import type { DashboardViewState } from '../dashboard/ink/Dashboard';
import { CONTAINER_TAB } from '../dashboard/panels/ContainersPanel';
import { SERVICE_TAB } from '../dashboard/panels/ServicesPanel';

/** A compose log target: a whole project (service null), or one service. */
export interface ComposeTarget {
  project: string | null;
  service: string | null;
}

const NO_COMPOSE: ComposeTarget = { project: null, service: null };

/**
 * What the dashboard streams and fetches for what is on screen. Pure, so the
 * policy is testable and the starts can be debounced against it.
 */
export interface ViewTargets {
  /** Container whose logs stream (every Containers tab: Patterns, Copy Logs and the Stats sparkline read them). */
  log: string | null;
  stats: string | null;
  /** The compare pane's container (Logs tab, pinned item). */
  secondaryLog: string | null;
  compose: ComposeTarget;
  secondaryCompose: ComposeTarget;
  /** Sorting by a stats field needs a sample of every running container. */
  sampleAllStats: boolean;
  /** Container to inspect (env, restart policy, mounts, health). */
  details: string | null;
  /**
   * Container whose filesystem diff to fetch: only with the Files tab on
   * screen. `docker diff` walks the container's layer and used to run on
   * every selection.
   */
  changes: string | null;
  /** Image whose layer history to fetch. */
  layers: string | null;
}

/** Whether the sort field needs live stats for every row. */
export function sortNeedsStats(sortField: DashboardViewState['sortField']): boolean {
  return sortField === 'cpu' || sortField === 'mem' || sortField === 'net' || sortField === 'io' || sortField === 'pids';
}

/** `project:<name>` or `service:<project>:<service>` → its compose log target. */
export function composeTargetOf(itemId: string | null): ComposeTarget {
  if (!itemId) return NO_COMPOSE;
  const parts = itemId.split(':');
  if (parts[0] === 'project') return { project: parts.slice(1).join(':'), service: null };
  if (parts[0] === 'service') return { project: parts[1] ?? null, service: parts.slice(2).join(':') };
  return NO_COMPOSE;
}

export function viewTargets(view: DashboardViewState): ViewTargets {
  const { panelId, itemId, detailTabIndex, sortField, compareItemId } = view;
  const liveSort = sortNeedsStats(sortField);
  const targets: ViewTargets = {
    log: null,
    stats: null,
    secondaryLog: null,
    compose: NO_COMPOSE,
    secondaryCompose: NO_COMPOSE,
    sampleAllStats: liveSort && panelId === 'containers',
    details: null,
    changes: null,
    layers: null,
  };
  if (panelId === 'containers') {
    targets.log = itemId;
    targets.stats = itemId && (detailTabIndex === CONTAINER_TAB.stats || liveSort) ? itemId : null;
    targets.secondaryLog = detailTabIndex === CONTAINER_TAB.logs && compareItemId ? compareItemId : null;
    targets.details = itemId;
    targets.changes = itemId && detailTabIndex === CONTAINER_TAB.files ? itemId : null;
  } else if (panelId === 'services') {
    if (itemId && detailTabIndex === SERVICE_TAB.logs) {
      targets.compose = composeTargetOf(itemId);
      targets.secondaryCompose = composeTargetOf(compareItemId);
    }
  } else if (panelId === 'images') {
    targets.layers = itemId;
  }
  return targets;
}

export function sameComposeTarget(a: ComposeTarget, b: ComposeTarget): boolean {
  return a.project === b.project && a.service === b.service;
}

/** How long a selection must settle before its streams and inspect calls start. */
export const VIEW_SETTLE_MS = 150;

export interface ViewSchedulerOptions<T> {
  /** Start what the view needs (streams, fetches). */
  apply: (view: T) => void;
  /** Runs at once on every change: stop what the new view no longer needs. */
  release?: (view: T) => void;
  delayMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (timer: unknown) => void;
}

export interface ViewScheduler<T> {
  change(view: T): void;
  /** Apply the latest view now (Ctrl+R), cancelling a pending start. */
  flush(): void;
  dispose(): void;
}

/**
 * Trailing debounce for selection-driven starts. Holding j through a list
 * used to open and abort a log stream, a stats stream and an inspect call
 * for every row passed. The first view applies at once, so startup is not
 * delayed; later ones apply once the selection has settled, while `release`
 * stops the old selection's streams immediately — its lines never show
 * under the new name.
 */
export function createViewScheduler<T>(opts: ViewSchedulerOptions<T>): ViewScheduler<T> {
  const delay = opts.delayMs ?? VIEW_SETTLE_MS;
  const setTimer = opts.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = opts.clearTimer ?? ((t: unknown) => { clearTimeout(t as ReturnType<typeof setTimeout>); });
  let latest: { view: T } | null = null;
  let timer: unknown = null;
  let first = true;
  const cancel = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };
  return {
    change(view) {
      latest = { view };
      if (first) {
        first = false;
        opts.apply(view);
        return;
      }
      opts.release?.(view);
      cancel();
      timer = setTimer(() => {
        timer = null;
        if (latest) opts.apply(latest.view);
      }, delay);
    },
    flush() {
      cancel();
      if (latest) opts.apply(latest.view);
    },
    dispose: cancel,
  };
}
