import React from 'react';
import { Box, Text } from 'ink';

interface ConfirmOverlayProps {
  message: string;
  severity: 'low' | 'high' | 'batch';
  onConfirm: () => void;
  onCancel: () => void;
}

const SEVERITY_CONFIG = {
  low: { borderColor: 'yellow', icon: '\u26A0', title: 'Confirm', warning: '' },
  high: { borderColor: 'red', icon: '\u2717', title: 'Destructive Action', warning: '  This cannot be undone.' },
  batch: { borderColor: 'red', icon: '\u2717\u2717', title: 'Batch Destructive Action', warning: '  This cannot be undone.' },
} as const;

export function ConfirmOverlay({ message, severity }: ConfirmOverlayProps): React.ReactElement {
  const config = SEVERITY_CONFIG[severity];
  const color = config.borderColor;

  return (
    <Box
      position="absolute"
      marginTop={3}
      marginLeft={3}
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
      <Text bold>{` ${message}`}</Text>
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
