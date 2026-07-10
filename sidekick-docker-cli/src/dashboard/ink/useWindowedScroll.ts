import { useState, useCallback } from 'react';
import { maxScrollOffset } from './windowLines';

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
  const [scrollOffset, setScrollOffset] = useState(0);

  const adjustScroll = useCallback((newIndex: number) => {
    // Conservative visible budget: windowLines may reserve up to two rows
    // for the ▲/▼ indicators, so keep the selection inside the worst case.
    const maxVisible = Math.max(1, viewportHeight - 2);
    let newOffset = scrollOffset;

    if (newIndex < scrollOffset) {
      newOffset = newIndex;
    } else if (newIndex >= scrollOffset + maxVisible) {
      newOffset = newIndex - maxVisible + 1;
    }

    newOffset = Math.max(0, Math.min(newOffset, maxScrollOffset(totalItems, viewportHeight)));
    setScrollOffset(newOffset);
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
