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
      paddingX={2}
      paddingY={1}
    >
      <Box>
        <Text color="red" bold>{'\u26A0 '}</Text>
        <Text bold color="red">{'Confirm Action'}</Text>
      </Box>
      <Text>{''}</Text>
      <Text>{` ${message}`}</Text>
      <Text color="gray" dimColor>{'  This cannot be undone.'}</Text>
      <Text>{''}</Text>
      <Box>
        <Text backgroundColor="green" color="white" bold>{' y Yes '}</Text>
        <Text>{'  '}</Text>
        <Text backgroundColor="red" color="white" bold>{' n No '}</Text>
        <Text color="gray" dimColor>{'   or Esc to cancel'}</Text>
      </Box>
    </Box>
  );
}
