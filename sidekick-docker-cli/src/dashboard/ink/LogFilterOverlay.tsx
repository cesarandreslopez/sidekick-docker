import React from 'react';
import { Box, Text } from 'ink';
import type { FilterMode } from 'sidekick-docker-shared';
import { ACCENT_FILL } from '../../theme';

interface LogFilterOverlayProps {
  filterString: string;
  filterMode: FilterMode;
}

export function LogFilterOverlay({ filterString, filterMode }: LogFilterOverlayProps): React.ReactElement {
  const modeLabel = filterMode === 'exact' ? 'exact' : 'fuzzy';

  return (
    <Box position="absolute" marginTop={1} marginLeft={1}>
      <Text backgroundColor={ACCENT_FILL} color="white" bold>
        {` Log filter (${modeLabel}): ${filterString}\u2588 `}
      </Text>
      <Text color="gray">{'  Tab: toggle mode  Enter: apply  Esc: clear'}</Text>
    </Box>
  );
}
