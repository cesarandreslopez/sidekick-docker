import React from 'react';
import { Box, Text } from 'ink';
import type { DetailTab } from '../panels/types';

interface DetailTabBarProps {
  tabs: DetailTab[];
  activeIndex: number;
}

export function DetailTabBar({ tabs, activeIndex }: DetailTabBarProps): React.ReactElement {
  if (tabs.length <= 1) {
    return <Box />;
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
      <Text color="gray" dimColor>{'[/] cycle tabs'}</Text>
    </Box>
  );
}
