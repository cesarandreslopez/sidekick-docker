import React from 'react';
import { Box, Text } from 'ink';
import { ansi, clipAnsi } from '../../formatters';
import { ACCENT } from '../../theme';
import { FOLLOW_PAUSED_ROW_HINT } from './DetailPane';
import { compareColumnRows } from './windowLines';
import type { ColumnRow } from './windowLines';

interface CompareDetailPaneProps {
  primaryLines: string[];
  secondaryLines: string[];
  primaryScrollOffset: number;
  secondaryScrollOffset: number;
  viewportHeight: number;
  totalWidth: number;
  focused: boolean;
  primaryLabel: string;
  secondaryLabel: string;
  /** The primary column's follow is paused (shown in its ▼ row). */
  followPaused?: boolean;
}

function Cell({ row, width, paused }: { row: ColumnRow; width: number; paused?: boolean }): React.ReactElement {
  const color = row.indicator ? (paused ? 'yellow' : 'gray') : undefined;
  return <Text color={color} wrap="truncate">{clipAnsi(row.text, width)}</Text>;
}

export function CompareDetailPane({
  primaryLines,
  secondaryLines,
  primaryScrollOffset,
  secondaryScrollOffset,
  viewportHeight,
  totalWidth,
  focused,
  primaryLabel,
  secondaryLabel,
  followPaused,
}: CompareDetailPaneProps): React.ReactElement {
  // 3 chars for divider: space + │ + space
  const colWidth = Math.max(10, Math.floor((totalWidth - 5) / 2));

  // Header row: labels with a divider
  const headerLeft = clipAnsi(ansi.bold(primaryLabel), colWidth);
  const headerRight = clipAnsi(ansi.bold(secondaryLabel), colWidth);

  // viewportHeight excludes the column-header row (the parent budgets it via
  // scrollViewportHeight so scroll clamps agree). Each column is windowed on
  // its own: the two follow independently, so they rarely need the same ▲/▼.
  const left = compareColumnRows(primaryLines, primaryScrollOffset, viewportHeight, followPaused ? FOLLOW_PAUSED_ROW_HINT : '');
  const right = compareColumnRows(secondaryLines, secondaryScrollOffset, viewportHeight);

  return (
    <Box flexDirection="column" flexGrow={1} borderStyle={focused ? 'bold' : 'single'} borderColor={focused ? ACCENT : 'gray'}>
      {/* Column headers */}
      <Box>
        <Text wrap="truncate">{headerLeft}</Text>
        <Text color="gray" dimColor>{' │ '}</Text>
        <Text wrap="truncate">{headerRight}</Text>
      </Box>
      {left.map((row, i) => (
        <Box key={i}>
          <Cell row={row} width={colWidth} paused={followPaused && row.text.startsWith('▼')} />
          <Text color="gray" dimColor>{' │ '}</Text>
          <Cell row={right[i]} width={colWidth} />
        </Box>
      ))}
    </Box>
  );
}
