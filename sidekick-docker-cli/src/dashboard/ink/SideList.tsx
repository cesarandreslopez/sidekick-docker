import React from 'react';
import { Box, Text } from 'ink';
import type { PanelItem } from '../panels/types';
import { windowLines } from './windowLines';

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
}

const EMPTY_HINTS: Record<string, string[]> = {
  containers: ['Run a container to get started:', '  docker run -d nginx'],
  images: ['Pull an image to get started:', '  docker pull nginx'],
  volumes: ['Create a volume to get started:', '  docker volume create my-vol'],
  networks: ['Create a network to get started:', '  docker network create my-net'],
  services: ['Start a compose project:', '  docker compose up -d'],
};

export function SideList({ items, selectedIndex, scrollOffset, focused, width, viewportHeight, panelTitle, filterString, panelId, totalCount, runningCount, compareItemId, listState = 'ready' }: SideListProps): React.ReactElement {
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
    <Box flexDirection="column" width={width} borderStyle={focused ? 'bold' : 'single'} borderColor={focused ? '#2B4C7E' : 'gray'}>
      {/* Panel title in first row */}
      <Text color={focused ? '#2B4C7E' : 'gray'} bold>{` ${titleLabel}`}</Text>
      {win.hasUp && (
        <Text color="gray">{` \u25B2 (${win.above} more)`}</Text>
      )}
      {visibleItems.map((item, i) => {
        const actualIndex = scrollOffset + i;
        const isSelected = actualIndex === selectedIndex;

        // Split icon from rest of label (icon is first non-space character)
        const trimmed = item.label.trimStart();
        const leadingSpaces = item.label.length - trimmed.length;
        const prefix = item.label.substring(0, leadingSpaces);

        // Extract first character cluster as icon (handles multi-byte unicode)
        const segments = [...trimmed];
        const icon = segments[0] || '';
        const rest = segments.slice(1).join('');

        const isPinned = compareItemId != null && item.id === compareItemId;
        const rightLabel = isPinned ? `\u{1F4CC}${item.rightLabel ? ' ' + item.rightLabel : ''}` : (item.rightLabel || '');
        const rightLen = rightLabel.length;

        // Compute available width for left portion (prefix + icon + rest)
        // Layout: " {prefix}{icon}{rest}  {rightLabel} "
        const leftWidth = innerWidth - rightLen - (rightLen ? 1 : 0);
        if (isSelected && focused) {
          // Focused selection: icon preserves its color, rest uses brand inverse
          const restText = rest.length < leftWidth - prefix.length - 1
            ? rest + ' '.repeat(leftWidth - prefix.length - 1 - rest.length)
            : rest.substring(0, leftWidth - prefix.length - 1);
          return (
            <Box key={item.id}>
              <Text color="#2B4C7E" bold inverse wrap="truncate">{` ${prefix}`}</Text>
              <Text color={item.iconColor || '#2B4C7E'} bold inverse>{icon}</Text>
              <Text color="#2B4C7E" bold inverse wrap="truncate">{restText}</Text>
              {rightLen > 0 && (
                <Text color="#2B4C7E" bold inverse>{` ${rightLabel}`}</Text>
              )}
              {!rightLen && <Text color="#2B4C7E" bold inverse>{' '}</Text>}
            </Box>
          );
        }

        // Normal rendering: icon gets its own color
        const iconColor = item.iconColor || (isSelected ? '#2B4C7E' : 'white');
        const textColor = isSelected ? '#2B4C7E' : 'white';

        return (
          <Box key={item.id}>
            <Text color={textColor} bold={isSelected} wrap="truncate">
              {` ${prefix}`}
            </Text>
            <Text color={iconColor} bold={isSelected}>
              {icon}
            </Text>
            <Text color={textColor} bold={isSelected} wrap="truncate">
              {rest.length < leftWidth - prefix.length - 1
                ? rest + ' '.repeat(leftWidth - prefix.length - 1 - rest.length)
                : rest.substring(0, leftWidth - prefix.length - 1)}
            </Text>
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
          <Text color="yellow">{` \u2717 No matches for "${filterString}"`}</Text>
          <Text color="gray" dimColor>{' Press Esc to clear filter'}</Text>
        </Box>
      )}
      {items.length === 0 && !filterString && listState === 'disconnected' && (
        <Box flexDirection="column" paddingTop={1}>
          <Text color="red">{' \u25CB Docker daemon unreachable'}</Text>
          <Text color="gray" dimColor>{' Waiting to reconnect\u2026'}</Text>
        </Box>
      )}
      {items.length === 0 && !filterString && listState === 'loading' && (
        <Box flexDirection="column" paddingTop={1}>
          <Text color="gray">{' Connecting to Docker\u2026'}</Text>
        </Box>
      )}
      {items.length === 0 && !filterString && listState === 'ready' && (
        <Box flexDirection="column" paddingTop={1}>
          <Text color="gray">{` \u2500 No ${panelTitle.toLowerCase()} found`}</Text>
          {panelId && EMPTY_HINTS[panelId] && (
            <>
              <Text>{''}</Text>
              <Text color="gray" dimColor>{` ${EMPTY_HINTS[panelId][0]}`}</Text>
              <Text color="#2B4C7E" bold>{` ${EMPTY_HINTS[panelId][1]}`}</Text>
            </>
          )}
        </Box>
      )}
    </Box>
  );
}
