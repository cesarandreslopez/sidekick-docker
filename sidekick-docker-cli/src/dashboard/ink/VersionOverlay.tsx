import React from 'react';
import { Box, Text } from 'ink';
import { BRAND_INLINE, BRAND_TAGLINE, getRandomPhrase } from 'sidekick-docker-shared';

interface VersionOverlayProps {
  version: string;
}

export function VersionOverlay({ version }: VersionOverlayProps): React.ReactElement {
  const phrase = React.useMemo(() => getRandomPhrase(), []);

  return (
    <Box flexDirection="column" flexGrow={1} padding={1}>
      <Text bold color="magenta">{`\u26A1 ${BRAND_INLINE}`}</Text>
      <Text color="#2B4C7E" bold>{`${BRAND_TAGLINE} v${version}`}</Text>
      <Text>{''}</Text>
      <Text color="gray" dimColor>{'\u2500'.repeat(40)}</Text>
      <Text>{''}</Text>
      <Text color="gray" italic>{`  "${phrase}"`}</Text>
      <Text>{''}</Text>
      <Text color="gray" dimColor>{'\u2500'.repeat(40)}</Text>
      <Text>{''}</Text>
      <Text color="gray" dimColor>{'Press V or Esc to close'}</Text>
    </Box>
  );
}
