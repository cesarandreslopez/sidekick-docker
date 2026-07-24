import { useCallback } from 'react';
import type { SidePanel, PanelItem, PanelAction, DetailTab } from '../panels/types';
import type { TerminalMouseEvent } from './mouse';
import type { DashboardUIState, Action, AddToast } from './dashboardTypes';
import { executeAction } from './executeAction';
import { contextMenuHit, confirmHit, sortHit } from './overlayHitTest';
import { windowLines } from './windowLines';
import type { SortField } from './dashboardTypes';

const SORT_FIELDS: SortField[] = ['state', 'name', 'cpu', 'mem', 'net', 'io', 'pids'];

interface MouseContext {
  state: DashboardUIState;
  dispatch: (action: Action) => void;
  panels: SidePanel[];
  panelCounts: { total: number; running?: number }[];
  currentItems: PanelItem[];
  clampedSelection: number;
  selectedItem: PanelItem | undefined;
  /** Condition-filtered actions for the selected item (context menu contents). */
  applicableActions: PanelAction[];
  sideWidth: number;
  sideViewportHeight: number;
  sideScroll: {
    scrollOffset: number;
    setSelected(index: number): void;
  };
  detailLines: string[];
  detailViewportHeight: number;
  detailTabs: DetailTab[];
  tabIdx: number;
  rows: number;
  addToast: AddToast;
  removeToast: (id: number) => void;
}

export function useMouseHandler(ctx: MouseContext): (event: TerminalMouseEvent) => void {
  const { state, dispatch, panels, panelCounts, currentItems, clampedSelection, selectedItem, applicableActions, sideWidth, sideViewportHeight, sideScroll, detailLines, detailViewportHeight, detailTabs, tabIdx, rows, addToast, removeToast } = ctx;
  // Read the individual fields outside the callback: closing over `state` itself would make
  // the whole object the dependency, which the compiler cannot reconcile with the field-level
  // dependency array below (react-hooks/preserve-manual-memoization).
  const { overlay, activePanelIndex, confirmAction, confirmSeverity } = state;

  return useCallback((event: TerminalMouseEvent) => {
    // Text-entry overlays: ignore all mouse events (raw escape bytes leak into the input)
    if (overlay === 'filter' || overlay === 'log-filter') return;
    // Overlays are clickable: buttons/rows activate, clicks outside dismiss.
    if (overlay) {
      if (event.type !== 'click' || event.button !== 'left') return;
      const { x, y } = event;
      switch (overlay) {
        case 'confirm': {
          if (confirmHit(x, y, confirmSeverity) === 'yes') {
            confirmAction?.();
          }
          // No / outside = cancel (safe default)
          dispatch({ type: 'SET_CONFIRM', action: null, message: '' });
          return;
        }
        case 'context-menu': {
          const idx = contextMenuHit(x, y, applicableActions);
          // Close the menu BEFORE executing: executeAction may open the
          // confirm overlay, which a later SET_OVERLAY:null would clobber.
          dispatch({ type: 'SET_OVERLAY', overlay: null });
          if (idx !== null && selectedItem) {
            executeAction(applicableActions[idx], selectedItem, dispatch, addToast, removeToast);
          }
          return;
        }
        case 'sort': {
          const idx = sortHit(x, y);
          if (idx !== null) {
            dispatch({ type: 'SET_SORT_FIELD', field: SORT_FIELDS[idx] });
            addToast(`Sort: ${SORT_FIELDS[idx]}`, 'info');
          } else {
            dispatch({ type: 'SET_OVERLAY', overlay: null });
          }
          return;
        }
        default:
          // help / version: any click closes
          dispatch({ type: 'SET_OVERLAY', overlay: null });
          return;
      }
    }

    const { x, y } = event;

    // Scroll wheel
    if (event.type === 'scroll') {
      if (x < sideWidth && sideWidth > 0) {
        const delta = event.scrollDirection === 'down' ? 3 : -3;
        dispatch({ type: 'SCROLL_SIDE', delta, itemCount: currentItems.length });
        const newIdx = Math.max(0, Math.min(clampedSelection + delta, currentItems.length - 1));
        sideScroll.setSelected(newIdx);
      } else {
        const delta = event.scrollDirection === 'down' ? 3 : -3;
        // Wheel-up on a logs tab pauses follow; reaching the bottom resumes it.
        const followTab = detailTabs[tabIdx]?.autoScrollBottom === true;
        dispatch({ type: 'SCROLL_DETAIL_DELTA', delta, totalLines: detailLines.length, viewportHeight: detailViewportHeight, followTab });
      }
      return;
    }

    if (event.type !== 'click' || (event.button !== 'left' && event.button !== 'right')) return;
    const rightClick = event.button === 'right';

    // Right-click opens the actions menu for the clicked (side list) or selected item.
    if (rightClick) {
      if (x < sideWidth && sideWidth > 0) {
        const itemRow = y - 3 - (sideScroll.scrollOffset > 0 ? 1 : 0);
        const itemIndex = sideScroll.scrollOffset + itemRow;
        // Bound by the rows actually rendered (windowLines budgets ▲/▼ rows),
        // so clicks on the ▼ indicator or blank rows don't hit off-screen items.
        const rendered = windowLines(currentItems, sideScroll.scrollOffset, sideViewportHeight).visible.length;
        if (itemRow >= 0 && itemRow < rendered) {
          dispatch({ type: 'SET_FOCUS', target: 'side' });
          dispatch({ type: 'SELECT_ITEM', index: itemIndex });
          sideScroll.setSelected(itemIndex);
          dispatch({ type: 'SET_OVERLAY', overlay: 'context-menu' });
        }
      } else if (selectedItem && applicableActions.length > 0) {
        dispatch({ type: 'SET_OVERLAY', overlay: 'context-menu' });
      }
      return;
    }

    // Row 0: TabBar
    if (y === 0) {
      let col = 0;
      for (let i = 0; i < panels.length; i++) {
        const count = panelCounts[i];
        let countLen = 0;
        if (count) {
          countLen = count.running !== undefined
            ? ` ${count.running}/${count.total}`.length
            : ` ${count.total}`.length;
        }
        const tabWidth = String(panels[i].shortcutKey).length + panels[i].title.length + 3 + countLen + 1;
        if (x >= col && x < col + tabWidth) {
          panels[activePanelIndex]?.onDeactivate?.();
          dispatch({ type: 'SWITCH_PANEL', index: i });
          panels[i]?.onActivate?.();
          return;
        }
        col += tabWidth;
      }
      return;
    }

    // Last row: StatusBar (no action)
    if (y >= rows - 1) return;

    // Main content area
    if (x < sideWidth && sideWidth > 0) {
      // Click in side list
      dispatch({ type: 'SET_FOCUS', target: 'side' });
      // Rows above the first item: 0 TabBar, 1 border, 2 panel title (+1 when ▲ shows).
      const hasScrollUp = sideScroll.scrollOffset > 0;
      const itemRow = y - 3 - (hasScrollUp ? 1 : 0);
      const itemIndex = sideScroll.scrollOffset + itemRow;
      const rendered = windowLines(currentItems, sideScroll.scrollOffset, sideViewportHeight).visible.length;
      if (itemRow >= 0 && itemRow < rendered) {
        dispatch({ type: 'SELECT_ITEM', index: itemIndex });
        sideScroll.setSelected(itemIndex);
      }
    } else {
      // Click in detail area
      dispatch({ type: 'SET_FOCUS', target: 'detail' });

      // Row 1 = DetailTabBar — check for tab click
      if (y === 1 && detailTabs.length > 1) {
        let col = sideWidth;
        for (let i = 0; i < detailTabs.length; i++) {
          const tabWidth = detailTabs[i].label.length + 3;
          if (x >= col && x < col + tabWidth) {
            dispatch({ type: 'SET_DETAIL_TAB', index: i });
            return;
          }
          col += tabWidth;
        }
      }
    }
  }, [overlay, activePanelIndex, confirmAction, confirmSeverity, sideWidth, sideViewportHeight, currentItems, clampedSelection, selectedItem, applicableActions, sideScroll, detailLines.length, detailViewportHeight, panels, panelCounts, detailTabs, tabIdx, rows, addToast, removeToast, dispatch]);
}
