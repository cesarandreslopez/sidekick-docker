import React from 'react';
import { Box, Text } from 'ink';
import type { PanelAction } from '../panels/types';

interface ContextMenuOverlayProps {
  actions: PanelAction[];
  selectedIndex: number;
}

export function ContextMenuOverlay({ actions, selectedIndex }: ContextMenuOverlayProps): React.ReactElement {
  return (
    <Box
      position="absolute"
      marginTop={2}
      marginLeft={2}
      flexDirection="column"
      borderStyle="single"
      borderColor="cyan"
      paddingX={1}
    >
      <Text bold color="cyan">{'Actions'}</Text>
      {actions.map((action, i) => {
        const isSelected = i === selectedIndex;
        return (
          <Box key={action.key}>
            <Text
              color={isSelected ? '#2B4C7E' : 'white'}
              bold={isSelected}
              inverse={isSelected}
            >
              {` ${action.key} ${action.label} `}
            </Text>
          </Box>
        );
      })}
      <Text color="gray">{'Esc to close'}</Text>
    </Box>
  );
}
