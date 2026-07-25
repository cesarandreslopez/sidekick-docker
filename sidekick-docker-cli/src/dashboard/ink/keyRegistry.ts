import type { Key } from 'ink';
import type { SidePanel, PanelItem, PanelAction, DetailTab } from '../panels/types';
import type { Action, DashboardUIState, ToastSeverity } from './dashboardTypes';
import { maxScrollOffset } from './windowLines';

/**
 * The read-only slice of dashboard state that availability predicates, hints,
 * and help rendering inspect.
 *
 * Kept separate from `KeyContext` on purpose: `buildHelpBindings` and
 * `buildContextHint` are called *during render*, and `KeyContext` carries
 * effectful handles (`dispatch`, `addToast`, `exit`) that close over refs.
 * Passing those into a render-time call is a React correctness violation
 * (react-hooks/refs), so the render path only ever sees this subset.
 */
export interface KeyQueryContext {
  state: DashboardUIState;
  panel: SidePanel;
  selectedItem: PanelItem | undefined;
  /** Condition-filtered actions for the selected item. */
  applicableActions: PanelAction[];
  detailTabs: DetailTab[];
  tabIdx: number;
  secondaryDetailLineCount: number;
}

/** Full context for `run` handlers: the query slice plus effectful handles. */
export interface KeyContext extends KeyQueryContext {
  dispatch: (action: Action) => void;
  panels: SidePanel[];
  clampedSelection: number;
  currentItems: PanelItem[];
  detailLines: string[];
  detailViewportHeight: number;
  sideScroll: {
    selectNext(): void;
    selectPrev(): void;
    selectFirst(): void;
    selectLast(): void;
    setSelected(index: number): void;
  };
  addToast: (message: string, severity: ToastSeverity, duration?: number) => number;
  exit: () => void;
}

export type KeyCategory = 'Navigation' | 'View' | 'Filters & Sort' | 'System';

export interface KeyBindingSpec {
  id: string;
  /** Display form for help/hints, e.g. ['j/k', '↑/↓']. */
  keys: string[];
  match: (input: string, key: Key) => boolean;
  label: string;
  category: KeyCategory;
  /** When false, the key press shows a "Not available here" toast and the help entry is dimmed. */
  isAvailable?: (ctx: KeyQueryContext) => boolean;
  /** Contextual status-bar hint (e.g. 'f:Filter'); only shown when available. */
  hint?: (ctx: KeyQueryContext) => string | null;
  run: (ctx: KeyContext, input: string, key: Key) => void;
}

/** True when the active detail tab tails content (logs) — drives log-filter availability and follow-pause. */
function isAutoScrollTab(ctx: KeyQueryContext): boolean {
  return ctx.detailTabs[ctx.tabIdx]?.autoScrollBottom === true;
}

/** Move the side-list selection by a page-sized delta, mirroring the wheel path. */
function pageSideSelection(ctx: KeyContext, delta: number): void {
  if (ctx.currentItems.length === 0) return;
  ctx.dispatch({ type: 'SCROLL_SIDE', delta, itemCount: ctx.currentItems.length });
  const newIdx = Math.max(0, Math.min(ctx.clampedSelection + delta, ctx.currentItems.length - 1));
  ctx.sideScroll.setSelected(newIdx);
}

function pageScroll(ctx: KeyContext, direction: 1 | -1, half: boolean): void {
  const page = half ? Math.max(1, Math.floor(ctx.detailViewportHeight / 2)) : Math.max(1, ctx.detailViewportHeight);
  if (ctx.state.focusTarget === 'side') {
    pageSideSelection(ctx, direction * page);
    return;
  }
  ctx.dispatch({
    type: 'SCROLL_DETAIL_DELTA',
    delta: direction * page,
    totalLines: ctx.detailLines.length,
    viewportHeight: ctx.detailViewportHeight,
    followTab: isAutoScrollTab(ctx),
  });
}

export const GLOBAL_BINDINGS: KeyBindingSpec[] = [
  {
    id: 'quit',
    keys: ['q'],
    match: (input) => input === 'q',
    label: 'Quit',
    category: 'System',
    run: (ctx) => ctx.exit(),
  },
  {
    id: 'quit-ctrl-c',
    keys: ['Ctrl+C'],
    // Matched pre-overlay in useKeyboardHandler; listed here so help stays complete.
    match: (input, key) => key.ctrl && input === 'c',
    label: 'Quit (always)',
    category: 'System',
    run: (ctx) => ctx.exit(),
  },
  {
    id: 'help',
    keys: ['?'],
    match: (input) => input === '?',
    label: 'Help',
    category: 'System',
    run: (ctx) => ctx.dispatch({ type: 'SET_OVERLAY', overlay: 'help' }),
  },
  {
    id: 'version',
    keys: ['V'],
    match: (input) => input === 'V',
    label: 'Version info',
    category: 'System',
    run: (ctx) => ctx.dispatch({ type: 'SET_OVERLAY', overlay: 'version' }),
  },
  {
    id: 'panel-switch',
    keys: ['1-5'],
    match: (input) => /^[1-9]$/.test(input),
    label: 'Switch panel',
    category: 'Navigation',
    run: (ctx, input) => {
      const idx = parseInt(input, 10) - 1;
      if (idx >= ctx.panels.length) return;
      ctx.panels[ctx.state.activePanelIndex]?.onDeactivate?.();
      ctx.dispatch({ type: 'SWITCH_PANEL', index: idx });
      ctx.panels[idx]?.onActivate?.();
    },
  },
  {
    id: 'focus-toggle',
    keys: ['Tab'],
    match: (_input, key) => key.tab,
    label: 'Toggle focus (list ↔ detail)',
    category: 'Navigation',
    run: (ctx) => ctx.dispatch({ type: 'TOGGLE_FOCUS' }),
  },
  {
    id: 'layout-cycle',
    keys: ['z'],
    match: (input) => input === 'z',
    label: 'Cycle layout (Normal/Wide/Expanded)',
    category: 'View',
    run: (ctx) => {
      ctx.dispatch({ type: 'CYCLE_LAYOUT' });
      const next = ctx.state.layoutMode === 'normal' ? 'Wide' : ctx.state.layoutMode === 'wide' ? 'Expanded' : 'Normal';
      ctx.addToast(`Layout: ${next}`, 'info');
    },
  },
  {
    id: 'filter',
    keys: ['/'],
    match: (input) => input === '/',
    label: 'Filter items',
    category: 'Filters & Sort',
    run: (ctx) => ctx.dispatch({ type: 'SET_OVERLAY', overlay: 'filter' }),
  },
  {
    id: 'log-filter',
    keys: ['f'],
    match: (input) => input === 'f',
    label: 'Log filter (Logs tab)',
    category: 'Filters & Sort',
    isAvailable: isAutoScrollTab,
    hint: () => 'f:Filter',
    run: (ctx) => ctx.dispatch({ type: 'SET_OVERLAY', overlay: 'log-filter' }),
  },
  {
    id: 'toggle-all',
    keys: ['a'],
    match: (input) => input === 'a',
    label: 'Toggle all/running (Containers)',
    category: 'Filters & Sort',
    isAvailable: (ctx) => ctx.panel.id === 'containers',
    hint: (ctx) => (ctx.state.showAllContainers ? 'a:All' : 'a:Running'),
    run: (ctx) => {
      ctx.dispatch({ type: 'TOGGLE_SHOW_ALL' });
      ctx.addToast(ctx.state.showAllContainers ? 'Running only' : 'Show all', 'info');
    },
  },
  {
    id: 'sort-menu',
    keys: ['o'],
    match: (input) => input === 'o',
    label: 'Sort menu (Containers)',
    category: 'Filters & Sort',
    isAvailable: (ctx) => ctx.panel.id === 'containers',
    hint: (ctx) => `o:↕${ctx.state.sortField}`,
    run: (ctx) => ctx.dispatch({ type: 'SET_OVERLAY', overlay: 'sort' }),
  },
  {
    id: 'sort-reverse',
    keys: ['R'],
    match: (input) => input === 'R',
    label: 'Reverse sort (Containers)',
    category: 'Filters & Sort',
    isAvailable: (ctx) => ctx.panel.id === 'containers',
    run: (ctx) => {
      ctx.dispatch({ type: 'TOGGLE_SORT_REVERSE' });
      ctx.addToast(`Sort: ${ctx.state.sortReversed ? 'ascending' : 'descending'}`, 'info');
    },
  },
  {
    id: 'compare-pin',
    keys: ['m'],
    match: (input) => input === 'm',
    label: 'Pin/unpin log comparison',
    category: 'View',
    isAvailable: (ctx) => (ctx.panel.id === 'containers' || ctx.panel.id === 'services') && ctx.selectedItem !== undefined,
    hint: () => 'm:Compare',
    run: (ctx) => {
      const item = ctx.selectedItem;
      if (!item) return;
      const currentCompare = ctx.state.compareItemIds[ctx.panel.id] ?? null;
      ctx.dispatch({ type: 'PIN_COMPARE', panelId: ctx.panel.id, itemId: item.id });
      if (currentCompare === item.id) {
        ctx.addToast('Unpinned comparison', 'info');
      } else {
        const label = item.label.replace(/^[^\w]*/, '').trim();
        ctx.addToast(`Pinned ${label} for comparison`, 'info');
        // The split view only renders on the logs tab — switch so it appears immediately.
        if (!isAutoScrollTab(ctx)) {
          const logsTabIdx = ctx.detailTabs.findIndex(t => t.autoScrollBottom);
          if (logsTabIdx >= 0) {
            ctx.dispatch({ type: 'SET_DETAIL_TAB', index: logsTabIdx });
          }
        }
      }
    },
  },
  {
    id: 'actions-menu',
    keys: ['x'],
    match: (input) => input === 'x',
    label: 'Actions menu',
    category: 'System',
    isAvailable: (ctx) => ctx.selectedItem !== undefined && ctx.applicableActions.length > 0,
    run: (ctx) => ctx.dispatch({ type: 'SET_OVERLAY', overlay: 'context-menu' }),
  },
  {
    id: 'detail-tab-cycle',
    keys: ['[/]'],
    match: (input) => input === '[' || input === ']',
    label: 'Cycle detail tabs',
    category: 'Navigation',
    run: (ctx, input) => {
      ctx.dispatch({ type: 'CYCLE_DETAIL_TAB', direction: input === '[' ? -1 : 1, tabCount: ctx.detailTabs.length });
    },
  },
  {
    id: 'secondary-scroll',
    keys: ['J/K'],
    match: (input) => input === 'J' || input === 'K',
    label: 'Scroll compare pane',
    category: 'Navigation',
    isAvailable: (ctx) => ctx.secondaryDetailLineCount > 0,
    run: (ctx, input) => {
      ctx.dispatch({
        type: 'SCROLL_SECONDARY_DETAIL_DELTA',
        delta: input === 'J' ? 1 : -1,
        totalLines: ctx.secondaryDetailLineCount,
        viewportHeight: ctx.detailViewportHeight,
      });
    },
  },
  {
    id: 'nav',
    keys: ['j/k', '↑/↓'],
    match: (input, key) => input === 'j' || input === 'k' || key.downArrow || key.upArrow,
    label: 'Navigate / scroll',
    category: 'Navigation',
    run: (ctx, input, key) => {
      const down = input === 'j' || key.downArrow;
      if (ctx.state.focusTarget === 'side') {
        if (down) {
          if (ctx.clampedSelection < ctx.currentItems.length - 1) {
            ctx.dispatch({ type: 'SELECT_ITEM', index: ctx.clampedSelection + 1 });
            ctx.sideScroll.selectNext();
          }
        } else if (ctx.clampedSelection > 0) {
          ctx.dispatch({ type: 'SELECT_ITEM', index: ctx.clampedSelection - 1 });
          ctx.sideScroll.selectPrev();
        }
        return;
      }
      ctx.dispatch({
        type: 'SCROLL_DETAIL_DELTA',
        delta: down ? 1 : -1,
        totalLines: ctx.detailLines.length,
        viewportHeight: ctx.detailViewportHeight,
        followTab: isAutoScrollTab(ctx),
      });
    },
  },
  {
    id: 'page-scroll',
    keys: ['PgUp/PgDn'],
    match: (_input, key) => key.pageUp || key.pageDown,
    label: 'Page up / down',
    category: 'Navigation',
    run: (ctx, _input, key) => pageScroll(ctx, key.pageDown ? 1 : -1, false),
  },
  {
    id: 'half-page-scroll',
    keys: ['Ctrl+d/u'],
    match: (input, key) => key.ctrl && (input === 'd' || input === 'u'),
    label: 'Half page down / up',
    category: 'Navigation',
    run: (ctx, input) => pageScroll(ctx, input === 'd' ? 1 : -1, true),
  },
  {
    id: 'jump-edges',
    keys: ['g/G'],
    match: (input) => input === 'g' || input === 'G',
    label: 'Jump to first / last',
    category: 'Navigation',
    run: (ctx, input) => {
      const top = input === 'g';
      if (ctx.state.focusTarget === 'side') {
        if (top) {
          ctx.dispatch({ type: 'SELECT_ITEM', index: 0 });
          ctx.sideScroll.selectFirst();
        } else {
          ctx.dispatch({ type: 'SELECT_ITEM', index: Math.max(0, ctx.currentItems.length - 1) });
          ctx.sideScroll.selectLast();
        }
        return;
      }
      // G lands at the bottom, which resumes follow on logs tabs.
      ctx.dispatch({
        type: 'SCROLL_DETAIL',
        offset: top ? 0 : maxScrollOffset(ctx.detailLines.length, ctx.detailViewportHeight),
        followTab: isAutoScrollTab(ctx),
        totalLines: ctx.detailLines.length,
        viewportHeight: ctx.detailViewportHeight,
      });
    },
  },
  {
    id: 'descend',
    keys: ['Enter'],
    match: (_input, key) => key.return,
    label: 'Open detail pane',
    category: 'Navigation',
    run: (ctx) => {
      if (ctx.state.focusTarget === 'side') {
        ctx.dispatch({ type: 'SET_FOCUS', target: 'detail' });
      }
    },
  },
  {
    id: 'focus-back',
    keys: ['h/←'],
    match: (input, key) => input === 'h' || key.leftArrow,
    label: 'Back to list',
    category: 'Navigation',
    run: (ctx) => {
      if (ctx.state.focusTarget === 'detail') {
        ctx.dispatch({ type: 'SET_FOCUS', target: 'side' });
      }
    },
  },
  {
    id: 'focus-detail',
    keys: ['l/→'],
    match: (input, key) => input === 'l' || key.rightArrow,
    label: 'Open detail pane',
    category: 'Navigation',
    run: (ctx) => {
      if (ctx.state.focusTarget === 'side') {
        ctx.dispatch({ type: 'SET_FOCUS', target: 'detail' });
      }
    },
  },
  {
    id: 'escape',
    keys: ['Esc'],
    match: (_input, key) => key.escape,
    label: 'Clear filter / back to list',
    category: 'Navigation',
    run: (ctx) => {
      if (ctx.state.filterString) {
        ctx.dispatch({ type: 'SET_FILTER', value: '' });
        return;
      }
      if (ctx.state.focusTarget === 'detail') {
        ctx.dispatch({ type: 'SET_FOCUS', target: 'side' });
      }
    },
  },
];

/** Availability-annotated view of the registry, for help rendering. */
export interface HelpBinding {
  keys: string[];
  label: string;
  category: KeyCategory;
  available: boolean;
}

export function buildHelpBindings(ctx: KeyQueryContext): HelpBinding[] {
  return GLOBAL_BINDINGS.map(b => ({
    keys: b.keys,
    label: b.label,
    category: b.category,
    available: b.isAvailable ? b.isAvailable(ctx) : true,
  }));
}

/** Status-bar contextual hints derived from available bindings. */
export function buildContextHint(ctx: KeyQueryContext): string {
  return GLOBAL_BINDINGS
    .filter(b => b.hint && (b.isAvailable ? b.isAvailable(ctx) : true))
    .map(b => b.hint!(ctx))
    .filter((h): h is string => h !== null && h !== '')
    .join('  ');
}
