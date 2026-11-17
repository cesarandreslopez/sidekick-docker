import React from 'react';
import { Box, Text } from 'ink';
import type { FilterMode } from 'sidekick-docker-shared';
import { ACCENT_FILL } from '../../theme';
import { filterBarLayout } from './filterBarLayout';

interface LogFilterOverlayProps {
  filterString: string;
  filterMode: FilterMode;
  /** Cells the bar may use; the query is cut from the left to stay on one row. */
  width: number;
}

export function LogFilterOverlay({ filterString, filterMode, width }: LogFilterOverlayProps): React.ReactElement {
  const modeLabel = filterMode === 'exact' ? 'exact' : 'fuzzy';
  const layout = filterBarLayout(`Log filter (${modeLabel}): `, filterString, ['  Tab: toggle mode  Enter: apply  Esc: clear'], width);

  return (
    <Box position="absolute" marginTop={1} marginLeft={1} width={width}>
      <Text backgroundColor={ACCENT_FILL} color="white" bold wrap="truncate">{layout.badge}</Text>
      {layout.extras.map((extra, i) => (
        <Text key={i} color="gray" wrap="truncate">{extra}</Text>
      ))}
    </Box>
  );
}
