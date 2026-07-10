import React from 'react';
import { Box, Text } from 'ink';
import type { SortField } from './dashboardTypes';
import { SORT_OVERLAY_ORIGIN } from './overlayHitTest';

const SORT_OPTIONS: { field: SortField; label: string }[] = [
  { field: 'state', label: 'State (running first)' },
  { field: 'name', label: 'Name' },
  { field: 'cpu', label: 'CPU %' },
  { field: 'mem', label: 'Memory %' },
  { field: 'net', label: 'Network I/O' },
  { field: 'io', label: 'Block I/O' },
  { field: 'pids', label: 'PIDs' },
];

interface SortOverlayProps {
  selectedIndex: number;
  currentField: SortField;
  reversed: boolean;
}

export function SortOverlay({ selectedIndex, currentField, reversed }: SortOverlayProps): React.ReactElement {
  return (
    <Box
      position="absolute"
      marginTop={SORT_OVERLAY_ORIGIN.top}
      marginLeft={SORT_OVERLAY_ORIGIN.left}
      flexDirection="column"
      borderStyle="single"
      borderColor="#2B4C7E"
      paddingX={1}
    >
      <Text bold color="#2B4C7E">{'\u2195 Sort by'}</Text>
      {SORT_OPTIONS.map((opt, i) => {
        const isSelected = i === selectedIndex;
        const isCurrent = opt.field === currentField;
        const indicator = isCurrent ? (reversed ? ' \u25B2' : ' \u25BC') : '';
        return (
          <Box key={opt.field}>
            <Text
              color={isSelected ? '#2B4C7E' : (isCurrent ? 'yellow' : 'white')}
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
