import React from 'react';
import { Box, Text } from 'ink';
import type { HelpLayout, HelpLine } from './helpLayout';
import { BRAND_INLINE, BRAND_TAGLINE } from 'sidekick-docker-shared';
import { ACCENT_FILL } from '../../theme';

interface HelpOverlayProps {
  version: string;
  layout: HelpLayout;
  /** Mouse capture on: the footer advertises clicks and the wheel only then. */
  mouseEnabled?: boolean;
}

function KeyBadge({ k, dimmed }: { k: string; dimmed?: boolean }): React.ReactElement {
  return dimmed
    ? <Text color="gray" dimColor>{` ${k} `}</Text>
    : <Text color="white" backgroundColor={ACCENT_FILL} bold>{` ${k} `}</Text>;
}

function Line({ line, width, keyWidth }: { line: HelpLine; width: number; keyWidth: number }): React.ReactElement {
  // ' ', not '': Ink gives an empty Text no height, and layoutHelp counts this row.
  if (line.kind === 'blank') return <Text>{' '}</Text>;
  if (line.kind === 'header') {
    return (
      <Box>
        <Text bold color="yellow">{`── ${line.title} `}</Text>
        <Text color="gray" dimColor>{'─'.repeat(Math.max(4, Math.min(34, width - 4) - line.title.length))}</Text>
      </Box>
    );
  }
  return (
    <Box>
      <Box width={keyWidth} justifyContent="flex-end" marginRight={1} flexShrink={0}>
        <KeyBadge k={line.keys} dimmed={line.dimmed} />
      </Box>
      <Text color={line.danger ? 'red' : 'gray'} dimColor={line.dimmed} wrap="truncate">
        {line.label}{line.danger ? ' ⚠' : ''}
      </Text>
    </Box>
  );
}

export function HelpOverlay({ version, layout, mouseEnabled = true }: HelpOverlayProps): React.ReactElement {
  const { columns, columnWidth, keyWidth, scroll, maxScroll } = layout;
  const position = maxScroll > 0 ? `  ·  ${scroll === 0 ? 'top' : scroll >= maxScroll ? 'end' : `${scroll}/${maxScroll}`} — j/k to scroll` : '';
  const mouse = mouseEnabled ? 'Mouse: click to select, wheel to scroll' : 'Mouse off: M turns it on';
  return (
    <Box flexDirection="column" flexGrow={1} padding={1}>
      <Box>
        <Text bold color="magenta">{`${BRAND_INLINE} ${BRAND_TAGLINE}`}</Text>
        <Text color="gray" dimColor>{` v${version}`}</Text>
      </Box>
      <Box flexDirection="row">
        {columns.map((col, i) => (
          <Box key={i} flexDirection="column" width={columnWidth} marginRight={i < columns.length - 1 ? 2 : 0}>
            {col.map((line, j) => <Line key={j} line={line} width={columnWidth} keyWidth={keyWidth} />)}
          </Box>
        ))}
      </Box>
      <Text>{' '}</Text>
      <Text color="gray" dimColor wrap="truncate">{`Press ? or Esc to close · ${mouse}${position}`}</Text>
    </Box>
  );
}
