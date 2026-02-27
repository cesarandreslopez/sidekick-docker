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
      <Text bold color="magenta">{BRAND_INLINE}</Text>
      <Text color="gray">{BRAND_TAGLINE} v{version}</Text>
      <Text>{''}</Text>
      <Text color="gray" italic>{`"${phrase}"`}</Text>
      <Text>{''}</Text>
      <Text color="gray">{'Press V or Esc to close'}</Text>
    </Box>
  );
}
