import React from 'react';
import { Box, Text } from 'ink';
import { windowLines } from './windowLines';
import { ACCENT } from '../../theme';

interface DetailPaneProps {
  lines: string[];
  scrollOffset: number;
  viewportHeight: number;
  focused: boolean;
  /** Logs follow is paused: the ▼ row says how to resume (the tab strip drops that hint when narrow). */
  followPaused?: boolean;
}

/** Appended to the ▼ row while a logs tab's follow is paused. */
export const FOLLOW_PAUSED_ROW_HINT = ' · paused — G to resume';

export function DetailPane({ lines, scrollOffset, viewportHeight, focused, followPaused }: DetailPaneProps): React.ReactElement {
  const win = windowLines(lines, scrollOffset, viewportHeight);

  return (
    <Box flexDirection="column" flexGrow={1} borderStyle={focused ? 'bold' : 'single'} borderColor={focused ? ACCENT : 'gray'}>
      {win.hasUp && (
        <Text color="gray" wrap="truncate">{`▲ (${win.above} more)`}</Text>
      )}
      {win.visible.map((line, i) => (
        <Text key={i} wrap="truncate">{line}</Text>
      ))}
      {win.hasDown && (
        <Text color={followPaused ? 'yellow' : 'gray'} wrap="truncate">{`▼ (${win.below} more)${followPaused ? FOLLOW_PAUSED_ROW_HINT : ''}`}</Text>
      )}
    </Box>
  );
}
