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
      <Text bold color="cyan">{'\u2630 Actions'}</Text>
      {actions.map((action, i) => {
        const isSelected = i === selectedIndex;
        const isDanger = !!action.confirm;
        // Unselected: danger actions in red, normal in white
        // Selected: inverse highlight
        const color = isSelected ? (isDanger ? 'red' : '#2B4C7E') : (isDanger ? 'red' : 'white');
        return (
          <Box key={action.key}>
            <Text
              color={color}
              bold={isSelected}
              inverse={isSelected}
            >
              {` ${action.key} `}
            </Text>
            <Text
              color={color}
              bold={isSelected}
              inverse={isSelected}
            >
              {`${action.label}${isDanger ? ' \u26A0' : ''} `}
            </Text>
          </Box>
        );
      })}
      <Text color="gray" dimColor>{'Esc to close'}</Text>
    </Box>
  );
}
