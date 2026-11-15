import { useState, useCallback } from 'react';
import { clampWindowOffset } from './windowLines';

interface UseWindowedScrollOptions {
  totalItems: number;
  viewportHeight: number;
}

interface UseWindowedScrollResult {
  selectedIndex: number;
  scrollOffset: number;
  setSelected: (index: number) => void;
  selectNext: () => void;
  selectPrev: () => void;
  selectFirst: () => void;
  selectLast: () => void;
}

export function useWindowedScroll({ totalItems, viewportHeight }: UseWindowedScrollOptions): UseWindowedScrollResult {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [storedOffset, setScrollOffset] = useState(0);
  // Clamped at read time: the stored offset was only recomputed on a
  // selection change, so a resize or a shrinking list left it past the end.
  const scrollOffset = clampWindowOffset(storedOffset, selectedIndex, totalItems, viewportHeight);

  const adjustScroll = useCallback((newIndex: number) => {
    // Conservative visible budget: windowLines may reserve up to two rows
    // for the ▲/▼ indicators, so keep the selection inside the worst case.
    setScrollOffset(clampWindowOffset(scrollOffset, newIndex, totalItems, viewportHeight));
  }, [scrollOffset, viewportHeight, totalItems]);

  const setSelected = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(index, totalItems - 1));
    setSelectedIndex(clamped);
    adjustScroll(clamped);
  }, [totalItems, adjustScroll]);

  const selectNext = useCallback(() => {
    if (selectedIndex < totalItems - 1) {
      setSelected(selectedIndex + 1);
    }
  }, [selectedIndex, totalItems, setSelected]);

  const selectPrev = useCallback(() => {
    if (selectedIndex > 0) {
      setSelected(selectedIndex - 1);
    }
  }, [selectedIndex, setSelected]);

  const selectFirst = useCallback(() => {
    setSelected(0);
  }, [setSelected]);

  const selectLast = useCallback(() => {
    setSelected(totalItems - 1);
  }, [totalItems, setSelected]);

  return {
    selectedIndex,
    scrollOffset,
    setSelected,
    selectNext,
    selectPrev,
    selectFirst,
    selectLast,
  };
}
