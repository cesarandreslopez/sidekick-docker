import React from 'react';
import { Box, Text } from 'ink';
import type { PanelItem } from '../panels/types';
import { windowLines } from './windowLines';
import { layoutSideRow } from './sideListLayout';
import { ACCENT } from '../../theme';

export type ListState = 'disconnected' | 'loading' | 'ready';

interface SideListProps {
  items: PanelItem[];
  selectedIndex: number;
  scrollOffset: number;
  focused: boolean;
  width: number;
  viewportHeight: number;
  panelTitle: string;
  filterString?: string;
  panelId?: string;
  totalCount?: number;
  runningCount?: number;
  compareItemId?: string;
  /** Distinguishes "still connecting" from "genuinely empty" for the empty state. */
  listState?: ListState;
  /** Containers hidden by the running-only toggle (a), for its empty state. */
  hiddenByRunningOnly?: number;
}

/** Empty-state hint per panel: gray lines, then the command to run (last line, accent). */
const EMPTY_HINTS: Record<string, string[]> = {
  containers: ['Run a container to get started:', '  docker run -d nginx'],
  images: ['Pull an image to get started:', '  docker pull nginx'],
  volumes: ['Create a volume to get started:', '  docker volume create my-vol'],
  networks: ['Create a network to get started:', '  docker network create my-net'],
  // Where projects come from — this used to sit on a placeholder row.
  services: ['Found from compose labels', 'or a compose file in CWD.', 'Start a compose project:', '  docker compose up -d'],
};

export function SideList({ items, selectedIndex, scrollOffset, focused, width, viewportHeight, panelTitle, filterString, panelId, totalCount, runningCount, compareItemId, listState = 'ready', hiddenByRunningOnly = 0 }: SideListProps): React.ReactElement {
  // viewportHeight already excludes the title row (RESERVED_UI_ROWS);
  // windowLines budgets the ▲/▼ indicator rows inside it.
  const win = windowLines(items, scrollOffset, viewportHeight);
  const visibleItems = win.visible;

  // Build panel title with count
  let titleLabel = panelTitle;
  if (totalCount !== undefined) {
    if (runningCount !== undefined) {
      titleLabel = `${panelTitle} (${runningCount}/${totalCount})`;
    } else {
      titleLabel = `${panelTitle} (${totalCount})`;
    }
  }

  // Inner width available for item content (minus 2 for border chars)
  const innerWidth = width - 2;

  return (
    // flexShrink 0: every row is laid out to exactly `width` (and the mouse
    // handler hit-tests at it), but long log lines beside the list made Ink
    // shrink it, so rows wrapped onto two lines on narrow terminals.
    <Box flexDirection="column" width={width} flexShrink={0} borderStyle={focused ? 'bold' : 'single'} borderColor={focused ? ACCENT : 'gray'}>
      {/* Panel title in first row */}
      <Text color={focused ? ACCENT : 'gray'} bold>{` ${titleLabel}`}</Text>
      {win.hasUp && (
        <Text color="gray">{` \u25B2 (${win.above} more)`}</Text>
      )}
      {visibleItems.map((item, i) => {
        const actualIndex = scrollOffset + i;
        const isSelected = actualIndex === selectedIndex;

        const isPinned = compareItemId != null && item.id === compareItemId;
        const rightLabel = isPinned ? `\u{1F4CC}${item.rightLabel ? ' ' + item.rightLabel : ''}` : (item.rightLabel || '');
        const rightLen = rightLabel.length;

        // Plain-text layout: the name is fitted (middle-truncated) and the
        // badge drawn as its own run, so the row is exactly innerWidth.
        const { prefix, icon, text: restText, badge } = layoutSideRow(item, innerWidth, rightLabel);
        if (isSelected && focused) {
          // Focused selection: icon preserves its color, rest uses brand inverse
          return (
            <Box key={item.id}>
              {/* '>' rather than a space: inverse video is stripped under
                  NO_COLOR, which would otherwise leave selection invisible. */}
              <Text color={ACCENT} bold inverse>{`>${prefix}`}</Text>
              <Text color={item.iconColor || ACCENT} bold inverse>{icon}</Text>
              <Text color={ACCENT} bold inverse wrap="truncate">{restText}</Text>
              {badge && <Text color={item.badgeColor || ACCENT} bold inverse>{badge}</Text>}
              {rightLen > 0 && (
                <Text color={ACCENT} bold inverse>{` ${rightLabel}`}</Text>
              )}
              {/* No trailing filler here: restText is already padded out to
                  restWidth, so the row totals exactly innerWidth — the same as
                  the unfocused branch below. An extra column made the row
                  innerWidth + 1, and Ink squeezed the leading '>' instead,
                  which is the selection marker. */}
            </Box>
          );
        }

        // Normal rendering: icon gets its own color. Unselected rows use the
        // terminal's own foreground — an explicit 'white' disappears entirely
        // on a light-background terminal.
        const iconColor = item.iconColor || (isSelected ? ACCENT : undefined);
        const textColor = isSelected ? ACCENT : undefined;
        // Selection in an unfocused list was signalled by colour alone, which
        // is invisible with NO_COLOR or on a monochrome terminal.
        const marker = isSelected ? '>' : ' ';

        return (
          <Box key={item.id}>
            {/* marker occupies the same column the leading space did, so no
                width arithmetic below needs to change. */}
            <Text color={textColor} bold={isSelected}>
              {`${marker}${prefix}`}
            </Text>
            <Text color={iconColor} bold={isSelected}>
              {icon}
            </Text>
            <Text color={textColor} bold={isSelected} wrap="truncate">
              {restText}
            </Text>
            {badge && <Text color={item.badgeColor} bold={isSelected}>{badge}</Text>}
            {rightLen > 0 && (
              <Text color={item.rightColor || 'gray'} bold={isSelected}>
                {` ${rightLabel}`}
              </Text>
            )}
          </Box>
        );
      })}
      {win.hasDown && (
        <Text color="gray">{` \u25BC (${win.below} more)`}</Text>
      )}
      {items.length === 0 && filterString && (
        <Box flexDirection="column" paddingTop={1}>
          <Text color="yellow" wrap="truncate">{` \u2717 No matches for "${filterString}"`}</Text>
          <Text color="gray" dimColor wrap="truncate">{' Press Esc to clear filter'}</Text>
        </Box>
      )}
      {items.length === 0 && !filterString && listState === 'disconnected' && (
        <Box flexDirection="column" paddingTop={1}>
          <Text color="red" wrap="truncate">{' \u25CB Docker daemon unreachable'}</Text>
          <Text color="gray" dimColor wrap="truncate">{' Waiting to reconnect\u2026'}</Text>
        </Box>
      )}
      {items.length === 0 && !filterString && listState === 'loading' && (
        <Box flexDirection="column" paddingTop={1}>
          <Text color="gray" wrap="truncate">{' Connecting to Docker\u2026'}</Text>
        </Box>
      )}
      {items.length === 0 && !filterString && listState === 'ready' && hiddenByRunningOnly > 0 && (
        <Box flexDirection="column" paddingTop={1}>
          {/* Running-only (a) with nothing running is not "no containers". */}
          <Text color="gray" wrap="truncate">{' \u2500 No running containers'}</Text>
          <Text color="gray" dimColor wrap="truncate">{` Press a to show all (${hiddenByRunningOnly})`}</Text>
        </Box>
      )}
      {items.length === 0 && !filterString && listState === 'ready' && hiddenByRunningOnly === 0 && (
        <Box flexDirection="column" paddingTop={1}>
          <Text color="gray" wrap="truncate">{` \u2500 No ${panelTitle.toLowerCase()} found`}</Text>
          {panelId && EMPTY_HINTS[panelId] && (
            <>
              {/* ' ': Ink gives an empty Text no height. */}
              <Text>{' '}</Text>
              {EMPTY_HINTS[panelId].slice(0, -1).map((line, i) => (
                <Text key={i} color="gray" dimColor wrap="truncate">{` ${line}`}</Text>
              ))}
              <Text color={ACCENT} bold wrap="truncate">{` ${EMPTY_HINTS[panelId].at(-1) ?? ''}`}</Text>
            </>
          )}
        </Box>
      )}
    </Box>
  );
}
