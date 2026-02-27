import React from 'react';
import { Box, Text } from 'ink';

interface DetailPaneProps {
  content: string;
  scrollOffset: number;
  viewportHeight: number;
  focused: boolean;
}

export function DetailPane({ content, scrollOffset, viewportHeight, focused }: DetailPaneProps): React.ReactElement {
  const lines = content.split('\n');
  const visibleLines = lines.slice(scrollOffset, scrollOffset + viewportHeight);
  const hasScrollUp = scrollOffset > 0;
  const hasScrollDown = scrollOffset + viewportHeight < lines.length;
  const aboveCount = scrollOffset;
  const belowCount = Math.max(0, lines.length - scrollOffset - viewportHeight);

  return (
    <Box flexDirection="column" flexGrow={1} borderStyle={focused ? 'bold' : 'single'} borderColor={focused ? '#2B4C7E' : 'gray'}>
      {hasScrollUp && (
        <Text color="gray">{`\u25B2 (${aboveCount} more)`}</Text>
      )}
      {visibleLines.map((line, i) => (
        <Text key={i} wrap="truncate">{line}</Text>
      ))}
      {hasScrollDown && (
        <Text color="gray">{`\u25BC (${belowCount} more)`}</Text>
      )}
    </Box>
  );
}
