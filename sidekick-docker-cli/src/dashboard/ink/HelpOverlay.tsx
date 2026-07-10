import React from 'react';
import { Box, Text } from 'ink';
import type { SidePanel } from '../panels/types';
import type { HelpBinding, KeyCategory } from './keyRegistry';
import { BRAND_INLINE, BRAND_TAGLINE } from 'sidekick-docker-shared';

interface HelpOverlayProps {
  panels: SidePanel[];
  activePanelIndex: number;
  version: string;
  bindings: HelpBinding[];
}

const CATEGORY_ORDER: KeyCategory[] = ['Navigation', 'View', 'Filters & Sort', 'System'];

function KeyBadge({ k, dimmed }: { k: string; dimmed?: boolean }): React.ReactElement {
  return dimmed
    ? <Text color="gray" dimColor>{` ${k} `}</Text>
    : <Text color="white" backgroundColor="#2B4C7E" bold>{` ${k} `}</Text>;
}

function SectionHeader({ title }: { title: string }): React.ReactElement {
  return (
    <Box>
      <Text bold color="yellow">{`── ${title} `}</Text>
      <Text color="gray" dimColor>{'─'.repeat(Math.max(4, 34 - title.length))}</Text>
    </Box>
  );
}

export function HelpOverlay({ panels, activePanelIndex, version, bindings }: HelpOverlayProps): React.ReactElement {
  const panel = panels[activePanelIndex];
  const actions = panel.getActions();

  return (
    <Box flexDirection="column" flexGrow={1} padding={1}>
      <Box>
        <Text bold color="magenta">{`⚡ ${BRAND_INLINE} ${BRAND_TAGLINE}`}</Text>
        <Text color="gray" dimColor>{` v${version}`}</Text>
      </Box>

      {CATEGORY_ORDER.map(category => {
        const entries = bindings.filter(b => b.category === category);
        if (entries.length === 0) return null;
        return (
          <Box key={category} flexDirection="column">
            <Text>{''}</Text>
            <SectionHeader title={category} />
            {entries.map(b => (
              <Box key={`${category}-${b.keys[0]}-${b.label}`}>
                <Box width={10} justifyContent="flex-end" marginRight={1}>
                  <KeyBadge k={b.keys[0]} dimmed={!b.available} />
                </Box>
                <Text color="gray" dimColor={!b.available}>
                  {b.label}
                  {!b.available ? ' (not here)' : ''}
                </Text>
              </Box>
            ))}
          </Box>
        );
      })}

      {/* Panel Actions Section */}
      {actions.length > 0 && (
        <>
          <Text>{''}</Text>
          <SectionHeader title={`${panel.title} Actions`} />
          {actions.map(a => (
            <Box key={a.key}>
              <Box width={10} justifyContent="flex-end" marginRight={1}>
                <KeyBadge k={a.key} />
              </Box>
              <Text color={a.confirm ? 'red' : 'gray'}>{a.label}</Text>
              {a.confirm && <Text color="red" dimColor>{' ⚠'}</Text>}
            </Box>
          ))}
        </>
      )}

      <Text>{''}</Text>
      <Text color="gray" dimColor>{'Press ? or Esc to close · Mouse: click to select, wheel to scroll'}</Text>
    </Box>
  );
}
