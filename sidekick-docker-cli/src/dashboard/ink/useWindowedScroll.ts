import { useState, useCallback } from 'react';

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
    const maxVisible = viewportHeight - 1;
    let newOffset = scrollOffset;

    if (newIndex < scrollOffset) {
      newOffset = newIndex;
    } else if (newIndex >= scrollOffset + maxVisible) {
      newOffset = newIndex - maxVisible + 1;
    }

    newOffset = Math.max(0, Math.min(newOffset, Math.max(0, totalItems - viewportHeight)));
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
