import React from 'react';
import { Box, Text } from 'ink';
import type { DetailTab } from '../panels/types';

interface DetailTabBarProps {
  tabs: DetailTab[];
  activeIndex: number;
  /** True when a logs tab has auto-follow paused by a manual scroll. */
  followPaused?: boolean;
}

export function DetailTabBar({ tabs, activeIndex, followPaused }: DetailTabBarProps): React.ReactElement {
  if (tabs.length <= 1) {
    return (
      <Box>
        {tabs.length === 1 && <Text color="gray" dimColor>{` ${tabs[0].label}`}</Text>}
        {followPaused && (
          <>
            <Box flexGrow={1} />
            <Text color="yellow">{'⏸ follow paused — G to resume'}</Text>
          </>
        )}
      </Box>
    );
  }

  return (
    <Box>
      {tabs.map((tab, i) => {
        const isActive = i === activeIndex;
        return (
          <Box key={tab.label} marginRight={1}>
            <Text
              color={isActive ? '#2B4C7E' : 'gray'}
              bold={isActive}
              inverse={isActive}
            >
              {` ${tab.label} `}
            </Text>
          </Box>
        );
      })}
      <Box flexGrow={1} />
      {followPaused
        ? <Text color="yellow">{'⏸ follow paused — G to resume'}</Text>
        : <Text color="gray" dimColor>{'[/] cycle tabs'}</Text>}
    </Box>
  );
}
