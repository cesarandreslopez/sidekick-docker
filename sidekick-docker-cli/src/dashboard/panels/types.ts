import type { DockerDashboardMetrics } from '../DockerState';
import type { ActionType, FilterMode, FollowStreamState, LogEntry } from 'sidekick-docker-shared';
import { filterLine } from 'sidekick-docker-shared';
import { ansi, logPlainText } from '../../formatters';

/** An item displayed in the side panel list. */
export interface PanelItem {
  id: string;
  /** Plain text (no ANSI): leading icon, then the name and any short hint. */
  label: string;
  /**
   * The item's plain name, for toasts, menu titles and compare headers.
   * Deriving it from `label` kept the port hint and badge ("web :8080 healthy").
   */
  name?: string;
  sortKey: number;
  data: unknown;
  /**
   * Short status word after the label (e.g. a health state), drawn as its own
   * run. Embedding its colour codes in `label` broke the list's width math.
   */
  badge?: string;
  badgeColor?: string;
  /** Right-aligned secondary text (e.g. uptime, size). */
  rightLabel?: string;
  /** Color for the rightLabel text. */
  rightColor?: string;
  /** Color for the leading icon character. */
  iconColor?: string;
}

/** An action available for the selected item. */
export interface PanelAction {
  key: string;
  label: string;
  /**
   * Return a Promise to get async feedback (in-progress → success/error toasts).
   * A resolved/returned string becomes the success toast text (e.g. "Pruned — 1.2 GB reclaimed").
   *
   * `void` here is deliberate and cannot be `undefined`: most handlers are written as
   * `() => { client.stopContainer(id); }`, whose inferred return type is `void` — which is
   * not assignable to `string | undefined`.
   */
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  handler: (item: PanelItem) => void | string | Promise<void | string>;
  condition?: (item: PanelItem) => boolean;
  /**
   * What the action does, for the shared progress and failure wording
   * ("Stopping web…", "Failed to stop web: …"). Without it the toasts fall
   * back to the label.
   */
  actionType?: ActionType;
  /** The name those toasts use, when it is not the item's own (Up on a service acts on its project). */
  targetName?: (item: PanelItem) => string;
  confirm?: boolean;
  /** Static message, or a function to interpolate the target's name/count. */
  confirmMessage?: string | ((item: PanelItem) => string);
  /** Risk level for confirmation dialog: 'low' (yellow), 'high' (red, default), 'batch' (red, shows count). */
  confirmSeverity?: 'low' | 'high' | 'batch';
}

/** The item's plain name: `name`, else the label without its leading icon. */
export function itemName(item: PanelItem): string {
  return item.name ?? item.label.replace(/^[^\w]*/, '').trim();
}

/**
 * What an empty Logs tab says, from the stream's state. It used to read
 * "Select a container" while one was selected, whether the stream was still
 * connecting, the container was stopped, or the stream had been lost.
 */
export function emptyLogMessage(state: FollowStreamState | null, subject: 'container' | 'service'): string {
  switch (state) {
    case 'reconnecting': return 'Log stream interrupted — reconnecting…';
    case 'ended':
    case 'empty': return `No log output — the ${subject} is stopped.`;
    case 'error': return 'Log stream lost after several retries. Select another item and come back to retry.';
    default: return 'Waiting for log output…';
  }
}

/** A tab in the detail pane for a selected item. */
export interface DetailTab {
  label: string;
  render: (item: PanelItem, metrics: DockerDashboardMetrics) => string | string[];
  autoScrollBottom?: boolean;
}

/**
 * Message for a detail tab whose lazy fetch failed.
 *
 * These fetches used to swallow their error, leaving the pane on "Loading…"
 * indefinitely with no way to tell a slow call from a broken one.
 */
export function detailFetchError(what: string, reason: string): string {
  // Through `ansi`, not raw escapes: those bypass the NO_COLOR/--no-color gate
  // in formatters.ts and leave this message colored when everything else is not.
  return `${ansi.red(`Could not load ${what}.`)}\n\n${reason}\n\n${ansi.gray('Reselect the item to retry.')}`;
}

/**
 * The lines the Logs tab currently shows: every message, or only those
 * matching the log filter — as plain text. The raw messages carried colour
 * codes and control characters into the clipboard.
 */
export function collectLogText(logs: readonly LogEntry[], query: string, mode: FilterMode): { text: string; count: number } {
  const plain = logs.map(logPlainText);
  const lines = query ? plain.filter(text => filterLine(text, query, mode).matched) : plain;
  return { text: lines.join('\n'), count: lines.length };
}

/**
 * The shared "Copy Logs" action: copies what the Logs tab shows (respecting
 * the log filter) from whichever buffer `getLogs` picks. `getStreamState`
 * tells a buffer that is empty because nothing streams it (Services only
 * streams compose logs on its Logs tab) from one that is just quiet.
 */
export function copyLogsAction(
  getMetrics: () => DockerDashboardMetrics | null,
  getLogs: (metrics: DockerDashboardMetrics) => readonly LogEntry[],
  copy: () => ((text: string) => boolean) | undefined,
  getStreamState?: (metrics: DockerDashboardMetrics) => FollowStreamState | null,
): PanelAction {
  return {
    key: 'c',
    label: 'Copy Logs',
    handler: () => {
      const metrics = getMetrics();
      const onCopy = copy();
      if (!metrics || !onCopy) return;
      const { text, count } = collectLogText(getLogs(metrics), metrics.logFilterString, metrics.logFilterMode);
      // Copying nothing used to report "Copied 0 lines" and empty the clipboard.
      if (count === 0) {
        throw new Error(metrics.logFilterString
          ? `no log lines match "${metrics.logFilterString}"`
          : getStreamState && getStreamState(metrics) === null
            ? 'no log lines loaded — open the Logs tab first'
            : 'no log lines to copy yet');
      }
      if (!onCopy(text)) {
        throw new Error('no clipboard tool found (install xclip, xsel, or wl-copy)');
      }
      return `Copied ${count} line${count === 1 ? '' : 's'}`;
    },
  };
}

/** Safely extract typed data from a PanelItem. Throws if data is null/undefined. */
export function panelData<T>(item: PanelItem): T {
  if (item.data == null) {
    throw new Error(`Panel item "${item.id}" has no data`);
  }
  return item.data as T;
}

/** A panel that populates the side list and detail pane. */
export interface SidePanel {
  readonly id: string;
  readonly title: string;
  readonly shortcutKey: number;
  readonly detailTabs: DetailTab[];

  getItems(metrics: DockerDashboardMetrics): PanelItem[];
  getActions(): PanelAction[];
  getSearchableText?(item: PanelItem): string;
  onActivate?(): void;
  onDeactivate?(): void;
  dispose?(): void;
}
