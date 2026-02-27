import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { BRAND_INLINE, BRAND_TAGLINE } from 'sidekick-docker-shared';

interface StatusBarProps {
  daemonConnected: boolean;
  focusTarget: 'side' | 'detail';
  panelHints: string;
  panelActionHints: string;
  filterString: string;
  containerCount?: number;
  runningCount?: number;
  version: string;
  matchCount?: number;
  totalCount?: number;
  lastRefresh?: Date | null;
}

function formatAgo(date: Date): { text: string; stale: boolean } {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 5) return { text: 'just now', stale: false };
  if (secs < 60) return { text: `${secs}s ago`, stale: false };
  const mins = Math.floor(secs / 60);
  return { text: `${mins}m ago`, stale: mins >= 1 };
}

export function StatusBar({ daemonConnected, focusTarget, panelHints, panelActionHints, filterString, containerCount, runningCount, version, matchCount, totalCount, lastRefresh }: StatusBarProps): React.ReactElement {
  // Re-render periodically to keep "ago" text fresh
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 5000);
    return () => clearInterval(timer);
  }, []);

  const ago = lastRefresh ? formatAgo(lastRefresh) : null;

  return (
    <Box>
      <Text bold color="magenta">{` ${BRAND_INLINE}`}</Text>
      <Text color="gray">{` ${BRAND_TAGLINE} v${version}`}</Text>
      <Text color="gray">{'  '}</Text>
      <Text color={daemonConnected ? 'green' : 'red'}>
        {daemonConnected ? `\u25CF ${runningCount ?? 0}/${containerCount ?? 0}` : '\u25CB disconnected'}
      </Text>
      {ago && (
        <Text color={ago.stale ? 'yellow' : 'gray'}>
          {`  \u21BB ${ago.text}`}
        </Text>
      )}
      <Text color="gray">{'  '}</Text>
      {panelActionHints ? <Text color="gray">{`${panelActionHints}  `}</Text> : null}
      <Text color="gray">
        {panelHints}
        {focusTarget === 'side' ? 'j/k nav  Tab focus  ' : 'j/k scroll  Tab focus  '}
        {'/ filter  ? help  q quit'}
      </Text>
      {filterString ? (
        <Text color="yellow">{`  Filter: "${filterString}"${matchCount !== undefined && totalCount !== undefined ? ` (${matchCount} of ${totalCount})` : ''}`}</Text>
      ) : null}
    </Box>
  );
}
