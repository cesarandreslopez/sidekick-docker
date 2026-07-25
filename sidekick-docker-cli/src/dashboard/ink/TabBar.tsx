import React from 'react';
import { Box, Text } from 'ink';
import type { SidePanel } from '../panels/types';
import { panelCountLabel, shouldCompactTabs } from './tabLayout';
import type { TabCount } from './tabLayout';

interface TabBarProps {
  panels: SidePanel[];
  activeIndex: number;
  layoutMode?: string;
  phrase?: string;
  panelCounts?: TabCount[];
  /** Terminal width, used to decide whether panel titles still fit. */
  width: number;
}

export function TabBar({ panels, activeIndex, layoutMode, phrase, panelCounts, width }: TabBarProps): React.ReactElement {
  // Below a certain width the five titles cannot fit. Dropping them keeps the
  // bar on one row; letting them shrink instead makes Ink wrap the text into
  // fragments across three rows and shifts every row the mouse handler counts.
  const compact = shouldCompactTabs(panels, panelCounts ?? [], layoutMode, width);

  return (
    <Box>
      {panels.map((panel, i) => {
        const isActive = i === activeIndex;
        const count = panelCounts?.[i];
        const countStr = panelCountLabel(count);
        let countColor: string | undefined;
        // Color-code: green = all running, yellow = partial, gray = none or no running info
        if (count?.running !== undefined) {
          if (count.running === count.total && count.total > 0) countColor = 'green';
          else if (count.running > 0) countColor = 'yellow';
        }
        return (
          <Box key={panel.id} marginRight={1} flexShrink={0}>
            <Text
              color={isActive ? '#2B4C7E' : 'gray'}
              bold={isActive}
              inverse={isActive}
              wrap="truncate"
            >
              {compact ? ` ${panel.shortcutKey}` : ` ${panel.shortcutKey} ${panel.title}`}
            </Text>
            <Text
              color={isActive ? (countColor || '#2B4C7E') : (countColor || 'gray')}
              bold={isActive}
              inverse={isActive}
              dimColor={!isActive && !countColor}
              wrap="truncate"
            >
              {countStr ? `${countStr} ` : ' '}
            </Text>
          </Box>
        );
      })}
      <Box flexGrow={1} flexShrink={1} marginLeft={1} overflow="hidden">
        {phrase && !compact && <Text color="gray" wrap="truncate">{phrase}</Text>}
      </Box>
      {/* Never shrink: the rotating phrase beside it is expendable, this is not. */}
      <Box flexShrink={0}>
        <Text color={layoutMode !== 'normal' ? '#2B4C7E' : 'gray'} wrap="truncate">
          {`z: ${layoutMode === 'expanded' ? 'Expanded' : layoutMode === 'wide' ? 'Wide' : 'Normal'} ▸`}
        </Text>
      </Box>
    </Box>
  );
}
