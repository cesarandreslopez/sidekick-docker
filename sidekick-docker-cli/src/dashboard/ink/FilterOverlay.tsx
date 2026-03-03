import React from 'react';
import { Box, Text } from 'ink';

interface FilterOverlayProps {
  filterString: string;
  matchCount?: number;
  totalCount?: number;
  panelTitle?: string;
}

export function FilterOverlay({ filterString, matchCount, totalCount, panelTitle }: FilterOverlayProps): React.ReactElement {
  const countInfo = matchCount !== undefined && totalCount !== undefined && panelTitle
    ? `  ${matchCount} of ${totalCount} ${panelTitle.toLowerCase()}`
    : '';

  return (
    <Box position="absolute" marginTop={1} marginLeft={1}>
      <Text backgroundColor="#2B4C7E" color="white" bold>
        {` \u2315 ${filterString}\u2588 `}
      </Text>
      {countInfo && (
        <Text color="gray" dimColor>{countInfo}</Text>
      )}
    </Box>
  );
}
