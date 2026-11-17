import React from 'react';
import { Box, Text } from 'ink';
import { CONFIRM_OVERLAY_ORIGIN, CONFIRM_WARNING, confirmLayout } from './overlayHitTest';
import type { ConfirmSeverity } from './overlayHitTest';
import { OVERLAY_FILL } from '../../theme';

interface ConfirmOverlayProps {
  message: string;
  severity: ConfirmSeverity;
  onConfirm: () => void;
  onCancel: () => void;
  maxWidth?: number;
}

const SEVERITY_CONFIG = {
  low: { borderColor: 'yellow', icon: '⚠', title: 'Confirm' },
  high: { borderColor: 'red', icon: '✗', title: 'Destructive Action' },
  batch: { borderColor: 'red', icon: '✗✗', title: 'Batch Destructive Action' },
} as const;

export function ConfirmOverlay({ message, severity, maxWidth }: ConfirmOverlayProps): React.ReactElement {
  const config = SEVERITY_CONFIG[severity];
  const color = config.borderColor;
  const warning = CONFIRM_WARNING[severity];
  // Clamped to the terminal; the message wraps (≤3 rows) instead of being
  // cut, and confirmHit counts the same rows to find the buttons.
  const layout = confirmLayout(message, severity, maxWidth);

  return (
    <Box
      position="absolute"
      backgroundColor={OVERLAY_FILL}
      marginTop={CONFIRM_OVERLAY_ORIGIN.top}
      marginLeft={CONFIRM_OVERLAY_ORIGIN.left}
      width={layout.width}
      flexDirection="column"
      borderStyle="double"
      borderColor={color}
      paddingX={2}
      paddingY={1}
    >
      <Box>
        <Text color={color} bold>{`${config.icon} `}</Text>
        <Text bold color={color}>{config.title}</Text>
      </Box>
      {/* ' ', not '': Ink gives an empty Text no height, which moved the
          buttons two rows above where confirmHit looks for them. */}
      <Text>{' '}</Text>
      {layout.lines.map((line, i) => (
        <Text key={i} bold wrap="truncate-end">{` ${line}`}</Text>
      ))}
      {warning ? (
        <Text color="gray" dimColor>{warning}</Text>
      ) : null}
      <Text>{' '}</Text>
      <Box>
        {/* Danger color sits on the dangerous button; No is the safe visual default. */}
        <Text backgroundColor={severity === 'low' ? 'yellow' : 'red'} color={severity === 'low' ? 'black' : 'white'} bold>{' y Yes '}</Text>
        <Text>{'  '}</Text>
        <Text backgroundColor="white" color="black" bold>{' n No '}</Text>
        <Text color="gray" dimColor>{'   Enter/Esc: cancel'}</Text>
      </Box>
    </Box>
  );
}
