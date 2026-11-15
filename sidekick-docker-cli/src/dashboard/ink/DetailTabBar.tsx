import React from 'react';
import { Box, Text } from 'ink';
import type { DetailTab } from '../panels/types';
import { detailTabWindow } from './tabLayout';
import type { DetailTabSuffix } from './tabLayout';
import { ACCENT } from '../../theme';

interface DetailTabBarProps {
  tabs: DetailTab[];
  activeIndex: number;
  /** Trailing text (detailTabSuffix) — the mouse handler windows the tabs with the same one. */
  suffix: DetailTabSuffix;
  /** Width of the detail pane, so the strip can drop what does not fit. */
  width: number;
}

function SuffixText({ suffix }: { suffix: DetailTabSuffix }): React.ReactElement {
  if (suffix.kind === 'name') return <Text color={ACCENT} bold wrap="truncate">{suffix.text}</Text>;
  if (suffix.kind === 'paused') return <Text color="yellow" wrap="truncate">{suffix.text}</Text>;
  return <Text color="gray" dimColor wrap="truncate">{suffix.text}</Text>;
}

export function DetailTabBar({ tabs, activeIndex, suffix, width }: DetailTabBarProps): React.ReactElement {
  if (tabs.length <= 1) {
    return (
      <Box>
        {tabs.length === 1 && <Text color="gray" dimColor wrap="truncate">{` ${tabs[0].label}`}</Text>}
        {suffix.kind !== 'hint' && (
          <>
            <Box flexGrow={1} />
            <SuffixText suffix={suffix} />
          </>
        )}
      </Box>
    );
  }

  const win = detailTabWindow(tabs.map(t => t.label), activeIndex, width, suffix.text.length);
  const visible = tabs
    .slice(win.start, win.start + win.count)
    .map((tab, i) => ({ tab, index: win.start + i }));

  return (
    <Box>
      {win.hasLeftMarker && <Text color="gray" dimColor>{'‹'}</Text>}
      {visible.map(({ tab, index }) => {
        const isActive = index === activeIndex;
        return (
          <Box key={tab.label} marginRight={1} flexShrink={0}>
            <Text
              color={isActive ? ACCENT : 'gray'}
              bold={isActive}
              inverse={isActive}
              wrap="truncate"
            >
              {/* [Logs] for the active tab: same width as " Logs ", and still
                  visible when NO_COLOR strips inverse video. */}
              {isActive ? `[${tab.label}]` : ` ${tab.label} `}
            </Text>
          </Box>
        );
      })}
      {win.start + win.count < tabs.length && <Text color="gray" dimColor>{'›'}</Text>}
      <Box flexGrow={1} flexShrink={1} overflow="hidden" />
      {win.showSuffix && <SuffixText suffix={suffix} />}
    </Box>
  );
}
