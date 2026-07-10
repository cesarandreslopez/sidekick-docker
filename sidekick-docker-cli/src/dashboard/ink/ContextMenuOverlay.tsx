import React from 'react';
import { Box, Text } from 'ink';
import type { PanelAction } from '../panels/types';
import { CONTEXT_MENU_ORIGIN, contextMenuWidth } from './overlayHitTest';

interface ContextMenuOverlayProps {
  actions: PanelAction[];
  selectedIndex: number;
  maxWidth?: number;
}

export function ContextMenuOverlay({ actions, selectedIndex, maxWidth }: ContextMenuOverlayProps): React.ReactElement {
  const width = maxWidth !== undefined ? Math.min(contextMenuWidth(actions), maxWidth) : undefined;
  return (
    <Box
      position="absolute"
      marginTop={CONTEXT_MENU_ORIGIN.top}
      marginLeft={CONTEXT_MENU_ORIGIN.left}
      width={width}
      flexDirection="column"
      borderStyle="single"
      borderColor="#2B4C7E"
      paddingX={1}
    >
      <Text bold color="#2B4C7E">{'\u2630 Actions'}</Text>
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
      <Text>{''}</Text>
      <Text color="gray" dimColor wrap="truncate">{'j/k select  Enter/click run  Esc close'}</Text>
    </Box>
  );
}
