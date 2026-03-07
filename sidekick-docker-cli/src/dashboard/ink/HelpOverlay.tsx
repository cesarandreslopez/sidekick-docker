import React from 'react';
import { Box, Text } from 'ink';
import type { SidePanel } from '../panels/types';
import { BRAND_INLINE, BRAND_TAGLINE } from 'sidekick-docker-shared';

interface HelpOverlayProps {
  panels: SidePanel[];
  activePanelIndex: number;
  version: string;
}

const GLOBAL_BINDINGS = [
  { key: '1-5', label: 'Switch panel' },
  { key: 'j/k', label: 'Navigate / scroll' },
  { key: 'g/G', label: 'Jump to first / last' },
  { key: 'Tab', label: 'Toggle focus' },
  { key: '[/]', label: 'Cycle detail tabs' },
  { key: 'z', label: 'Cycle layout (Normal/Wide/Expanded)' },
  { key: '/', label: 'Filter items' },
  { key: 'x', label: 'Actions menu' },
  { key: 'a', label: 'Toggle all/running (Containers)' },
  { key: 'o', label: 'Sort menu (Containers)' },
  { key: 'R', label: 'Reverse sort (Containers)' },
  { key: 'V', label: 'Version info' },
  { key: '?', label: 'This help' },
  { key: 'q', label: 'Quit' },
];

function KeyBadge({ k }: { k: string }): React.ReactElement {
  return (
    <Text color="white" backgroundColor="#2B4C7E" bold>{` ${k} `}</Text>
  );
}

export function HelpOverlay({ panels, activePanelIndex, version }: HelpOverlayProps): React.ReactElement {
  const panel = panels[activePanelIndex];
  const actions = panel.getActions();

  return (
    <Box flexDirection="column" flexGrow={1} padding={1}>
      <Box>
        <Text bold color="magenta">{`\u26A1 ${BRAND_INLINE} ${BRAND_TAGLINE}`}</Text>
        <Text color="gray" dimColor>{` v${version}`}</Text>
      </Box>
      <Text>{''}</Text>

      {/* Navigation Section */}
      <Box>
        <Text bold color="yellow">{'\u2500\u2500 Navigation '}</Text>
        <Text color="gray" dimColor>{'\u2500'.repeat(30)}</Text>
      </Box>
      <Text>{''}</Text>
      {GLOBAL_BINDINGS.map(b => (
        <Box key={b.key}>
          <Box width={10} justifyContent="flex-end" marginRight={1}>
            <KeyBadge k={b.key} />
          </Box>
          <Text color="gray">{b.label}</Text>
        </Box>
      ))}

      {/* Panel Actions Section */}
      {actions.length > 0 && (
        <>
          <Text>{''}</Text>
          <Box>
            <Text bold color="yellow">{`\u2500\u2500 ${panel.title} Actions `}</Text>
            <Text color="gray" dimColor>{'\u2500'.repeat(24)}</Text>
          </Box>
          <Text>{''}</Text>
          {actions.map(a => (
            <Box key={a.key}>
              <Box width={10} justifyContent="flex-end" marginRight={1}>
                <KeyBadge k={a.key} />
              </Box>
              <Text color={a.confirm ? 'red' : 'gray'}>{a.label}</Text>
              {a.confirm && <Text color="red" dimColor>{' \u26A0'}</Text>}
            </Box>
          ))}
        </>
      )}

      <Text>{''}</Text>
      <Text color="gray" dimColor>{'Press ? or Esc to close'}</Text>
    </Box>
  );
}
