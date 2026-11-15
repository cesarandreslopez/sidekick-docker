import React from 'react';
import { Box, Text } from 'ink';
import { useTerminalSize } from './useTerminalSize';
import { ACCENT } from '../../theme';
import { execViewportRows } from '../execShell';

interface ExecOverlayProps {
  containerName: string;
  outputLines: string[];
}

export function ExecOverlay({ containerName, outputLines }: ExecOverlayProps): React.ReactElement {
  const { rows } = useTerminalSize();
  // The header is the only other row: the status bar is hidden during exec.
  // Must match the PTY's size (ExecManager uses the same function).
  const viewportHeight = execViewportRows(rows);

  // Auto-scroll to bottom
  const scrollOffset = Math.max(0, outputLines.length - viewportHeight);
  const visibleLines = outputLines.slice(scrollOffset, scrollOffset + viewportHeight);

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box>
        <Text bold color={ACCENT}>{` Exec: ${containerName} `}</Text>
        <Text color="gray">{' (Ctrl+] to detach)'}</Text>
      </Box>
      <Box flexDirection="column" flexGrow={1}>
        {visibleLines.map((line, i) => (
          // Truncate, never wrap: a wrapped line takes two rows and pushes
          // the newest output off the bottom.
          <Text key={scrollOffset + i} wrap="truncate">{line || ' '}</Text>
        ))}
      </Box>
    </Box>
  );
}
