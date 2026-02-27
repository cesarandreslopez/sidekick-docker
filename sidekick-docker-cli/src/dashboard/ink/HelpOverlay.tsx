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
  { key: 'g/G', label: 'First / last item' },
  { key: 'Tab', label: 'Toggle focus (side/detail)' },
  { key: '[/]', label: 'Prev / next detail tab' },
  { key: 'z', label: 'Cycle layout mode' },
  { key: '/', label: 'Filter items' },
  { key: 'x', label: 'Context menu (actions)' },
  { key: 'V', label: 'Version info' },
  { key: '?', label: 'Toggle help' },
  { key: 'q', label: 'Quit' },
];

export function HelpOverlay({ panels, activePanelIndex, version }: HelpOverlayProps): React.ReactElement {
  const panel = panels[activePanelIndex];
  const actions = panel.getActions();

  return (
    <Box flexDirection="column" flexGrow={1} padding={1}>
      <Box>
        <Text bold color="magenta">{`${BRAND_INLINE} ${BRAND_TAGLINE}`}</Text>
        <Text color="gray">{` v${version}`}</Text>
      </Box>
      <Text>{''}</Text>

      <Text bold color="yellow">{'Navigation'}</Text>
      {GLOBAL_BINDINGS.map(b => (
        <Text key={b.key}>
          <Text color="#2B4C7E">{`  ${b.key.padEnd(8)}`}</Text>
          <Text>{b.label}</Text>
        </Text>
      ))}

      {actions.length > 0 && (
        <>
          <Text>{''}</Text>
          <Text bold color="yellow">{`${panel.title} Actions`}</Text>
          {actions.map(a => (
            <Text key={a.key}>
              <Text color="#2B4C7E">{`  ${a.key.padEnd(8)}`}</Text>
              <Text>{a.label}</Text>
              {a.confirm && <Text color="red">{' (requires confirmation)'}</Text>}
            </Text>
          ))}
        </>
      )}

      <Text>{''}</Text>
      <Text color="gray">{'Press ? or Esc to close'}</Text>
    </Box>
  );
}
