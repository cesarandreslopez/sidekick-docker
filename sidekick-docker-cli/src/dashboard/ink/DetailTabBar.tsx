import React from 'react';
import { Box, Text } from 'ink';
import type { DetailTab } from '../panels/types';
import { detailTabWindow } from './tabLayout';

const CYCLE_HINT = '[/] cycle tabs';
const FOLLOW_PAUSED = '⏸ follow paused — G to resume';

interface DetailTabBarProps {
  tabs: DetailTab[];
  activeIndex: number;
  /** True when a logs tab has auto-follow paused by a manual scroll. */
  followPaused?: boolean;
  /** Width of the detail pane, so the strip can drop what does not fit. */
  width: number;
}

export function DetailTabBar({ tabs, activeIndex, followPaused, width }: DetailTabBarProps): React.ReactElement {
  const suffix = followPaused ? FOLLOW_PAUSED : CYCLE_HINT;

  if (tabs.length <= 1) {
    return (
      <Box>
        {tabs.length === 1 && <Text color="gray" dimColor wrap="truncate">{` ${tabs[0].label}`}</Text>}
        {followPaused && (
          <>
            <Box flexGrow={1} />
            <Text color="yellow" wrap="truncate">{FOLLOW_PAUSED}</Text>
          </>
        )}
      </Box>
    );
  }

  const win = detailTabWindow(tabs.map(t => t.label), activeIndex, width, suffix.length);
  const visible = tabs
    .slice(win.start, win.start + win.count)
    .map((tab, i) => ({ tab, index: win.start + i }));

  return (
    <Box>
      {win.hasLeftMarker && <Text color="gray" dimColor>{'‹'}</Text>}
      {visible.map(({ tab, index }) => {
        const isActive = index === activeIndex;
        return (
          <Box key={tab.label} marginRight={1} flexShrink={0}>
            <Text
              color={isActive ? '#2B4C7E' : 'gray'}
              bold={isActive}
              inverse={isActive}
              wrap="truncate"
            >
              {` ${tab.label} `}
            </Text>
          </Box>
        );
      })}
      {win.start + win.count < tabs.length && <Text color="gray" dimColor>{'›'}</Text>}
      <Box flexGrow={1} flexShrink={1} overflow="hidden" />
      {win.showSuffix && (followPaused
        ? <Text color="yellow" wrap="truncate">{FOLLOW_PAUSED}</Text>
        : <Text color="gray" dimColor wrap="truncate">{CYCLE_HINT}</Text>)}
    </Box>
  );
}
