import React from 'react';
import { Box, Text } from 'ink';
import { BRAND_INLINE } from 'sidekick-docker-shared';

interface TooSmallOverlayProps {
  columns: number;
  rows: number;
}

export function TooSmallOverlay({ columns, rows }: TooSmallOverlayProps): React.ReactElement {
  return (
    <Box flexDirection="column" justifyContent="center" alignItems="center" height={rows} width={columns}>
      <Text bold color="magenta">{`\u26A1 ${BRAND_INLINE}`}</Text>
      <Text>{''}</Text>
      <Text color="yellow" bold>{'Terminal too small'}</Text>
      <Text color="gray">{`Current: ${columns}\u00D7${rows}  Minimum: 60\u00D715`}</Text>
      <Text>{''}</Text>
      <Text color="gray" dimColor>{'Resize your terminal to continue.'}</Text>
    </Box>
  );
}
