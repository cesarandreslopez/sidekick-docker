import React from 'react';
import { Box, Text } from 'ink';
import { ACCENT_FILL } from '../../theme';
import { filterBarLayout } from './filterBarLayout';

interface FilterOverlayProps {
  filterString: string;
  matchCount?: number;
  totalCount?: number;
  panelTitle?: string;
  /** Cells the bar may use; the query is cut from the left to stay on one row. */
  width: number;
}

export function FilterOverlay({ filterString, matchCount, totalCount, panelTitle, width }: FilterOverlayProps): React.ReactElement {
  const countInfo = matchCount !== undefined && totalCount !== undefined && panelTitle
    ? `  ${matchCount} of ${totalCount} ${panelTitle.toLowerCase()}`
    : '';
  const extras = [countInfo, '  Enter: apply  Esc: clear'].filter(Boolean);
  const layout = filterBarLayout('⌕ ', filterString, extras, width);

  return (
    <Box position="absolute" marginTop={1} marginLeft={1} width={width}>
      <Text backgroundColor={ACCENT_FILL} color="white" bold wrap="truncate">{layout.badge}</Text>
      {layout.extras.map((extra, i) => (
        <Text key={i} color="gray" dimColor wrap="truncate">{extra}</Text>
      ))}
    </Box>
  );
}
