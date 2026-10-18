import React from 'react';
import { Box, Text } from 'ink';
import type { PanelAction } from '../panels/types';
import { CONTEXT_MENU_ORIGIN, contextMenuWidth } from './overlayHitTest';
import { ACCENT } from '../../theme';

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
      borderColor={ACCENT}
      paddingX={1}
    >
      <Text bold color={ACCENT}>{'\u2630 Actions'}</Text>
      {actions.map((action, i) => {
        const isSelected = i === selectedIndex;
        const isDanger = !!action.confirm;
        // Unselected: danger actions in red, normal in white
        // Selected: inverse highlight
        // undefined (not 'white') = the terminal's own foreground, visible on light backgrounds too.
        const color = isSelected ? (isDanger ? 'red' : ACCENT) : (isDanger ? 'red' : undefined);
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
