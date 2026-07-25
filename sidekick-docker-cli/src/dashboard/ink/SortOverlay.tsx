import React from 'react';
import { Box, Text } from 'ink';
import type { SortField } from './dashboardTypes';
import { SORT_OPTIONS } from './dashboardTypes';
import { SORT_OVERLAY_ORIGIN, SORT_OVERLAY_WIDTH } from './overlayHitTest';


interface SortOverlayProps {
  selectedIndex: number;
  currentField: SortField;
  reversed: boolean;
  /** Clamp so the menu cannot run off a narrow terminal, as the other overlays do. */
  maxWidth: number;
}

export function SortOverlay({ selectedIndex, currentField, reversed, maxWidth }: SortOverlayProps): React.ReactElement {
  return (
    <Box
      position="absolute"
      marginTop={SORT_OVERLAY_ORIGIN.top}
      marginLeft={SORT_OVERLAY_ORIGIN.left}
      flexDirection="column"
      borderStyle="single"
      borderColor="#2B4C7E"
      paddingX={1}
      width={Math.min(maxWidth, SORT_OVERLAY_WIDTH)}
    >
      <Text bold color="#2B4C7E">{'\u2195 Sort by'}</Text>
      {SORT_OPTIONS.map((opt, i) => {
        const isSelected = i === selectedIndex;
        const isCurrent = opt.field === currentField;
        const indicator = isCurrent ? (reversed ? ' \u25B2' : ' \u25BC') : '';
        return (
          <Box key={opt.field}>
            <Text
              // undefined = the terminal's own foreground; an explicit
              // 'white' is invisible on a light background.
              color={isSelected ? '#2B4C7E' : (isCurrent ? 'yellow' : undefined)}
              bold={isSelected}
              inverse={isSelected}
            >
              {` ${opt.label}${indicator} `}
            </Text>
          </Box>
        );
      })}
      <Text>{''}</Text>
      <Text color="gray" dimColor>{'j/k select  Enter apply  R reverse  Esc close'}</Text>
    </Box>
  );
}

export { SORT_OPTIONS };
