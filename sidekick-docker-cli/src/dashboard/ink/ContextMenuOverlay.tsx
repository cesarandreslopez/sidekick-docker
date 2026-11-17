import React from 'react';
import { Box, Text } from 'ink';
import type { PanelAction } from '../panels/types';
import { CONTEXT_MENU_ORIGIN, CONTEXT_MENU_HINT, contextMenuWidth } from './overlayHitTest';
import { ACCENT, OVERLAY_FILL } from '../../theme';

interface ContextMenuOverlayProps {
  actions: PanelAction[];
  selectedIndex: number;
  /** contextMenuTitle(name): the same string contextMenuHit measures. */
  title: string;
  maxWidth?: number;
}

export function ContextMenuOverlay({ actions, selectedIndex, title, maxWidth }: ContextMenuOverlayProps): React.ReactElement {
  const width = maxWidth !== undefined ? Math.min(contextMenuWidth(actions, title), maxWidth) : undefined;
  return (
    <Box
      position="absolute"
      backgroundColor={OVERLAY_FILL}
      marginTop={CONTEXT_MENU_ORIGIN.top}
      marginLeft={CONTEXT_MENU_ORIGIN.left}
      width={width}
      flexDirection="column"
      borderStyle="single"
      borderColor={ACCENT}
      paddingX={1}
    >
      <Text bold color={ACCENT} wrap="truncate">{title}</Text>
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
              {/* ▸ in place of the leading space: inverse video is
                  stripped under NO_COLOR, which hid the cursor. */}
              {`${isSelected ? '\u25B8' : ' '}${action.key} `}
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
      <Text>{' '}</Text>
      <Text color="gray" dimColor wrap="truncate">{CONTEXT_MENU_HINT}</Text>
    </Box>
  );
}
