import React from 'react';
import { Box, Text } from 'ink';
import { windowLines } from './windowLines';

interface DetailPaneProps {
  lines: string[];
  scrollOffset: number;
  viewportHeight: number;
  focused: boolean;
}

export function DetailPane({ lines, scrollOffset, viewportHeight, focused }: DetailPaneProps): React.ReactElement {
  const win = windowLines(lines, scrollOffset, viewportHeight);

  return (
    <Box flexDirection="column" flexGrow={1} borderStyle={focused ? 'bold' : 'single'} borderColor={focused ? '#2B4C7E' : 'gray'}>
      {win.hasUp && (
        <Text color="gray">{`▲ (${win.above} more)`}</Text>
      )}
      {win.visible.map((line, i) => (
        <Text key={i} wrap="truncate">{line}</Text>
      ))}
      {win.hasDown && (
        <Text color="gray">{`▼ (${win.below} more)`}</Text>
      )}
    </Box>
  );
}
