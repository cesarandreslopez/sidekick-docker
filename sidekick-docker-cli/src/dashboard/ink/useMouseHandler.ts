import { useCallback } from 'react';
import type { SidePanel, PanelItem, DetailTab } from '../panels/types';
import type { TerminalMouseEvent } from './mouse';

type OverlayKind = null | 'help' | 'context-menu' | 'filter' | 'confirm' | 'exec' | 'version' | 'log-filter';

interface MouseState {
  overlay: OverlayKind;
  activePanelIndex: number;
}

// Subset of Action used by mouse handler
type MouseAction =
  | { type: 'SWITCH_PANEL'; index: number }
  | { type: 'SELECT_ITEM'; index: number }
  | { type: 'SET_DETAIL_TAB'; index: number }
  | { type: 'SET_FOCUS'; target: 'side' | 'detail' }
  | { type: 'SET_OVERLAY'; overlay: OverlayKind }
  | { type: 'SCROLL_SIDE'; delta: number; itemCount: number }
  | { type: 'SCROLL_DETAIL_DELTA'; delta: number; totalLines: number; viewportHeight: number };

interface MouseContext {
  state: MouseState;
  dispatch: (action: MouseAction) => void;
  panels: SidePanel[];
  panelCounts: { total: number; running?: number }[];
  currentItems: PanelItem[];
  clampedSelection: number;
  sideWidth: number;
  sideScroll: {
    scrollOffset: number;
    setSelected(index: number): void;
  };
  detailLines: string[];
  detailViewportHeight: number;
  detailTabs: DetailTab[];
  rows: number;
  rotatePhrase: () => void;
}

export function useMouseHandler(ctx: MouseContext): (event: TerminalMouseEvent) => void {
  const { state, dispatch, panels, panelCounts, currentItems, clampedSelection, sideWidth, sideScroll, detailLines, detailViewportHeight, detailTabs, rows, rotatePhrase } = ctx;

  return useCallback((event: TerminalMouseEvent) => {
    rotatePhrase();
    // Filter overlay: ignore all mouse events (raw escape bytes leak into filter string)
    if (state.overlay === 'filter') return;
    // Overlays: click anywhere dismisses
    if (state.overlay) {
      if (event.type === 'click') {
        dispatch({ type: 'SET_OVERLAY', overlay: null });
      }
      return;
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
        dispatch({ type: 'SCROLL_DETAIL_DELTA', delta, totalLines: detailLines.length, viewportHeight: detailViewportHeight });
      }
      return;
    }

    if (event.type !== 'click' || event.button !== 'left') return;

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
          panels[state.activePanelIndex]?.onDeactivate?.();
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
      const hasScrollUp = sideScroll.scrollOffset > 0;
      const itemRow = y - 2 - (hasScrollUp ? 1 : 0);
      const itemIndex = sideScroll.scrollOffset + itemRow;
      if (itemIndex >= 0 && itemIndex < currentItems.length) {
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
  }, [state.overlay, state.activePanelIndex, sideWidth, currentItems.length, clampedSelection, sideScroll, detailLines.length, detailViewportHeight, panels, panelCounts, detailTabs, rows, rotatePhrase, dispatch]);
}
