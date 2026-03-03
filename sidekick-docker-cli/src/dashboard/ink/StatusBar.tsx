import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { BRAND_INLINE, BRAND_TAGLINE } from 'sidekick-docker-shared';

interface StatusBarProps {
  daemonConnected: boolean;
  focusTarget: 'side' | 'detail';
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

const SEP = '\u2502'; // │ vertical bar separator

export function StatusBar({ daemonConnected, focusTarget, panelActionHints, filterString, containerCount, runningCount, version, matchCount, totalCount, lastRefresh }: StatusBarProps): React.ReactElement {
  // Re-render periodically to keep "ago" text fresh
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 5000);
    return () => clearInterval(timer);
  }, []);

  const ago = lastRefresh ? formatAgo(lastRefresh) : null;

  return (
    <Box>
      {/* Brand + version */}
      <Text bold color="magenta">{` \u26A1 ${BRAND_INLINE}`}</Text>
      <Text color="gray" dimColor>{` ${BRAND_TAGLINE} v${version}`}</Text>

      {/* Separator */}
      <Text color="gray" dimColor>{` ${SEP} `}</Text>

      {/* Daemon status */}
      <Text color={daemonConnected ? 'green' : 'red'}>
        {daemonConnected ? `\u25CF ${runningCount ?? 0}/${containerCount ?? 0}` : '\u25CB disconnected'}
      </Text>
      {ago && (
        <Text color={ago.stale ? 'yellow' : 'gray'} dimColor={!ago.stale}>
          {` \u21BB ${ago.text}`}
        </Text>
      )}

      {/* Separator */}
      <Text color="gray" dimColor>{` ${SEP} `}</Text>

      {/* Panel actions */}
      {panelActionHints ? (
        <>
          <Text color="#2B4C7E">{panelActionHints}</Text>
          <Text color="gray" dimColor>{` ${SEP} `}</Text>
        </>
      ) : null}

      {/* Navigation hints */}
      <Text color="gray" dimColor>
        {focusTarget === 'side' ? 'j/k nav  Tab focus' : 'j/k scroll  Tab focus'}
        {'  /filter  ?help  q quit'}
      </Text>

      {/* Active filter indicator */}
      {filterString ? (
        <Text color="yellow" bold>{`  \u25C9 "${filterString}"${matchCount !== undefined && totalCount !== undefined ? ` ${matchCount}/${totalCount}` : ''}`}</Text>
      ) : null}
    </Box>
  );
}
