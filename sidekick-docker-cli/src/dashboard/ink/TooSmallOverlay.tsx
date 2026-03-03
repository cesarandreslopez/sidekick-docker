import React from 'react';
import { Box, Text } from 'ink';
import { BRAND_INLINE } from 'sidekick-docker-shared';

interface TooSmallOverlayProps {
  columns: number;
  rows: number;
}

export function TooSmallOverlay({ columns, rows }: TooSmallOverlayProps): React.ReactElement {
  const needWidth = Math.max(0, 60 - columns);
  const needHeight = Math.max(0, 15 - rows);
  const hints: string[] = [];
  if (needWidth > 0) hints.push(`${needWidth} col${needWidth > 1 ? 's' : ''} wider`);
  if (needHeight > 0) hints.push(`${needHeight} row${needHeight > 1 ? 's' : ''} taller`);

  return (
    <Box flexDirection="column" justifyContent="center" alignItems="center" height={rows} width={columns}>
      <Text bold color="magenta">{`\u26A1 ${BRAND_INLINE}`}</Text>
      <Text>{''}</Text>
      <Text color="yellow" bold>{'Terminal too small'}</Text>
      <Text color="gray">{`${columns}\u00D7${rows} \u2192 need ${hints.join(' and ')}`}</Text>
      <Text>{''}</Text>
      <Text color="gray" dimColor>{'Resize to at least 60\u00D715 to continue.'}</Text>
    </Box>
  );
}
