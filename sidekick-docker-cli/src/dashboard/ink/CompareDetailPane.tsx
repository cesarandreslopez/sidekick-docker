import React from 'react';
import { Box, Text } from 'ink';
import { clipAnsi } from '../../formatters';

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
}: CompareDetailPaneProps): React.ReactElement {
  // 3 chars for divider: space + │ + space
  const colWidth = Math.max(10, Math.floor((totalWidth - 5) / 2));

  // Header row: labels with a divider
  const headerLeft = clipAnsi(`\x1b[1m${primaryLabel}\x1b[22m`, colWidth);
  const headerRight = clipAnsi(`\x1b[1m${secondaryLabel}\x1b[22m`, colWidth);

  // viewportHeight excludes the column-header row (the parent budgets it via
  // scrollViewportHeight so scroll clamps agree); indicator rows fit inside.
  const leftHasUp = primaryScrollOffset > 0;
  const rightHasUp = secondaryScrollOffset > 0;
  const anyUp = leftHasUp || rightHasUp;
  let contentBudget = Math.max(1, viewportHeight - (anyUp ? 1 : 0));
  const anyDownTentative =
    primaryScrollOffset + contentBudget < primaryLines.length ||
    secondaryScrollOffset + contentBudget < secondaryLines.length;
  if (anyDownTentative) contentBudget = Math.max(1, contentBudget - 1);

  // Visible lines for each column
  const leftVisible = primaryLines.slice(primaryScrollOffset, primaryScrollOffset + contentBudget);
  const rightVisible = secondaryLines.slice(secondaryScrollOffset, secondaryScrollOffset + contentBudget);

  const leftHasDown = primaryScrollOffset + contentBudget < primaryLines.length;
  const rightHasDown = secondaryScrollOffset + contentBudget < secondaryLines.length;

  const rows: React.ReactElement[] = [];

  for (let i = 0; i < contentBudget; i++) {
    const left = leftVisible[i] ?? '';
    const right = rightVisible[i] ?? '';
    rows.push(
      <Box key={i}>
        <Text wrap="truncate">{clipAnsi(left, colWidth)}</Text>
        <Text color="gray" dimColor>{' \u2502 '}</Text>
        <Text wrap="truncate">{clipAnsi(right, colWidth)}</Text>
      </Box>,
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1} borderStyle={focused ? 'bold' : 'single'} borderColor={focused ? '#2B4C7E' : 'gray'}>
      {/* Column headers */}
      <Box>
        <Text wrap="truncate">{headerLeft}</Text>
        <Text color="gray" dimColor>{' \u2502 '}</Text>
        <Text wrap="truncate">{headerRight}</Text>
      </Box>
      {/* Scroll up indicators */}
      {(leftHasUp || rightHasUp) && (
        <Box>
          <Text color="gray">{leftHasUp ? clipAnsi(`\u25B2 (${primaryScrollOffset} more)`, colWidth) : ' '.repeat(colWidth)}</Text>
          <Text color="gray" dimColor>{' \u2502 '}</Text>
          <Text color="gray">{rightHasUp ? clipAnsi(`\u25B2 (${secondaryScrollOffset} more)`, colWidth) : ' '.repeat(colWidth)}</Text>
        </Box>
      )}
      {/* Log content rows */}
      {rows}
      {/* Scroll down indicators */}
      {(leftHasDown || rightHasDown) && (
        <Box>
          <Text color="gray">{leftHasDown ? clipAnsi(`\u25BC (${Math.max(0, primaryLines.length - primaryScrollOffset - contentBudget)} more)`, colWidth) : ' '.repeat(colWidth)}</Text>
          <Text color="gray" dimColor>{' \u2502 '}</Text>
          <Text color="gray">{rightHasDown ? clipAnsi(`\u25BC (${Math.max(0, secondaryLines.length - secondaryScrollOffset - contentBudget)} more)`, colWidth) : ' '.repeat(colWidth)}</Text>
        </Box>
      )}
    </Box>
  );
}
