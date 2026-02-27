import React from 'react';
import { Box, Text } from 'ink';

interface ConfirmOverlayProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmOverlay({ message }: ConfirmOverlayProps): React.ReactElement {
  return (
    <Box
      position="absolute"
      marginTop={3}
      marginLeft={3}
      flexDirection="column"
      borderStyle="double"
      borderColor="red"
      paddingX={1}
    >
      <Text bold color="red">{' Confirm '}</Text>
      <Text>{` ${message}`}</Text>
      <Text>{''}</Text>
      <Text>
        <Text color="green">{' y '}</Text>
        <Text>{'Yes  '}</Text>
        <Text color="red">{' n '}</Text>
        <Text>{'No'}</Text>
      </Text>
    </Box>
  );
}
