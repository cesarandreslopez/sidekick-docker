import React from 'react';
import { Box, Text } from 'ink';
import type { SidePanel } from '../panels/types';

interface PanelCount {
  total: number;
  running?: number;
}

interface TabBarProps {
  panels: SidePanel[];
  activeIndex: number;
  layoutMode?: string;
  phrase?: string;
  panelCounts?: PanelCount[];
}

export function TabBar({ panels, activeIndex, layoutMode, phrase, panelCounts }: TabBarProps): React.ReactElement {
  return (
    <Box>
      {panels.map((panel, i) => {
        const isActive = i === activeIndex;
        const count = panelCounts?.[i];
        let countStr = '';
        if (count) {
          countStr = count.running !== undefined
            ? ` ${count.running}/${count.total}`
            : ` ${count.total}`;
        }
        return (
          <Box key={panel.id} marginRight={1}>
            <Text
              color={isActive ? '#2B4C7E' : 'gray'}
              bold={isActive}
              inverse={isActive}
            >
              {` ${panel.shortcutKey} ${panel.title}`}
            </Text>
            {countStr && (
              <Text
                color={isActive ? '#2B4C7E' : 'gray'}
                bold={isActive}
                inverse={isActive}
                dimColor={!isActive}
              >
                {`${countStr} `}
              </Text>
            )}
            {!countStr && (
              <Text
                color={isActive ? '#2B4C7E' : 'gray'}
                bold={isActive}
                inverse={isActive}
              >
                {' '}
              </Text>
            )}
          </Box>
        );
      })}
      <Box flexGrow={1} marginLeft={1}>
        {phrase && <Text color="gray" wrap="truncate">{phrase}</Text>}
      </Box>
      <Text color={layoutMode === 'expanded' ? '#2B4C7E' : 'gray'}>
        {`z: ${layoutMode === 'expanded' ? 'Expanded' : 'Normal'} \u25B8`}
      </Text>
    </Box>
  );
}
