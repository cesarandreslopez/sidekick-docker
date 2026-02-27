import React from 'react';
import { Box, Text } from 'ink';
import { useTerminalSize } from './useTerminalSize';

interface ExecOverlayProps {
  containerName: string;
  outputLines: string[];
}

export function ExecOverlay({ containerName, outputLines }: ExecOverlayProps): React.ReactElement {
  const { rows } = useTerminalSize();
  const viewportHeight = Math.max(1, rows - 3); // header + status + border

  // Auto-scroll to bottom
  const scrollOffset = Math.max(0, outputLines.length - viewportHeight);
  const visibleLines = outputLines.slice(scrollOffset, scrollOffset + viewportHeight);

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box>
        <Text bold color="#2B4C7E">{` Exec: ${containerName} `}</Text>
        <Text color="gray">{' (Ctrl+] to detach)'}</Text>
      </Box>
      <Box flexDirection="column" flexGrow={1}>
        {visibleLines.map((line, i) => (
          <Text key={scrollOffset + i}>{line || ' '}</Text>
        ))}
      </Box>
    </Box>
  );
}
