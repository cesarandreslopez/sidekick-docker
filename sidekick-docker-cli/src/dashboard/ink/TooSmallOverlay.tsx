import React from 'react';
import { Box, Text } from 'ink';

interface TooSmallOverlayProps {
  columns: number;
  rows: number;
}

export function TooSmallOverlay({ columns, rows }: TooSmallOverlayProps): React.ReactElement {
  return (
    <Box flexDirection="column" justifyContent="center" alignItems="center" height={rows} width={columns}>
      <Text color="yellow" bold>{'Terminal too small'}</Text>
      <Text color="gray">{`Current: ${columns}x${rows}`}</Text>
      <Text color="gray">{'Minimum: 60x15'}</Text>
      <Text color="gray">{'Please resize your terminal.'}</Text>
    </Box>
  );
}
