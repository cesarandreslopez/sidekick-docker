import React from 'react';
import { Box, Text } from 'ink';
import { CONFIRM_OVERLAY_ORIGIN } from './overlayHitTest';

interface ConfirmOverlayProps {
  message: string;
  severity: 'low' | 'high' | 'batch';
  onConfirm: () => void;
  onCancel: () => void;
  maxWidth?: number;
}

const SEVERITY_CONFIG = {
  low: { borderColor: 'yellow', icon: '\u26A0', title: 'Confirm', warning: '' },
  high: { borderColor: 'red', icon: '\u2717', title: 'Destructive Action', warning: '  This cannot be undone.' },
  batch: { borderColor: 'red', icon: '\u2717\u2717', title: 'Batch Destructive Action', warning: '  This cannot be undone.' },
} as const;

export function ConfirmOverlay({ message, severity, maxWidth }: ConfirmOverlayProps): React.ReactElement {
  const config = SEVERITY_CONFIG[severity];
  const color = config.borderColor;
  // Clamp so long messages truncate instead of pushing past the terminal edge
  // (single-row message keeps the buttons row where confirmHit expects it).
  const naturalWidth = Math.max(message.length + 1, config.warning.length, 36) + 6;
  const width = maxWidth !== undefined ? Math.min(naturalWidth, maxWidth) : undefined;

  return (
    <Box
      position="absolute"
      marginTop={CONFIRM_OVERLAY_ORIGIN.top}
      marginLeft={CONFIRM_OVERLAY_ORIGIN.left}
      width={width}
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
      <Text>{''}</Text>
      <Text bold wrap="truncate-end">{` ${message}`}</Text>
      {config.warning ? (
        <Text color="gray" dimColor>{config.warning}</Text>
      ) : null}
      <Text>{''}</Text>
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
