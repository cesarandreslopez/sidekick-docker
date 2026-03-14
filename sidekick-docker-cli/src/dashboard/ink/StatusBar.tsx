import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { BRAND_INLINE, BRAND_TAGLINE } from 'sidekick-docker-shared';

export interface ActionHint {
  key: string;
  label: string;
  destructive: boolean;
}

interface StatusBarProps {
  daemonConnected: boolean;
  focusTarget: 'side' | 'detail';
  panelActionHints: ActionHint[];
  filterString: string;
  containerCount?: number;
  runningCount?: number;
  version: string;
  matchCount?: number;
  totalCount?: number;
  lastRefresh?: Date | null;
  contextHint?: string;
}

function formatAgo(date: Date): { text: string; stale: boolean } {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 5) return { text: 'just now', stale: false };
  if (secs < 60) return { text: `${secs}s ago`, stale: false };
  const mins = Math.floor(secs / 60);
  return { text: `${mins}m ago`, stale: mins >= 1 };
}

const SEP = '\u2502'; // │ vertical bar separator

export function StatusBar({ daemonConnected, focusTarget, panelActionHints, filterString, containerCount, runningCount, version, matchCount, totalCount, lastRefresh, contextHint }: StatusBarProps): React.ReactElement {
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

      {/* Panel actions — destructive in red, safe in brand blue */}
      {panelActionHints.length > 0 && (
        <>
          {panelActionHints.map((hint, i) => (
            <React.Fragment key={hint.key}>
              {i > 0 && <Text>{'  '}</Text>}
              <Text color={hint.destructive ? 'red' : '#2B4C7E'}>
                {`${hint.key}:${hint.label}`}
              </Text>
            </React.Fragment>
          ))}
          <Text color="gray" dimColor>{` ${SEP} `}</Text>
        </>
      )}

      {/* Focus indicator */}
      <Text color={focusTarget === 'side' ? '#2B4C7E' : 'gray'} bold={focusTarget === 'side'}>{'\u25C0'}</Text>
      <Text color="gray" dimColor>{'/'}</Text>
      <Text color={focusTarget === 'detail' ? '#2B4C7E' : 'gray'} bold={focusTarget === 'detail'}>{'\u25B6'}</Text>

      {/* Navigation hints */}
      <Text color="gray" dimColor>
        {'  j/k  Tab  /  ?  q'}
      </Text>

      {/* Contextual hints for active panel */}
      {contextHint ? (
        <Text color="cyan" dimColor>{`  ${contextHint}`}</Text>
      ) : null}

      {/* Active filter indicator */}
      {filterString ? (
        <Text color="yellow" bold>{`  \u25C9 "${filterString}"${matchCount !== undefined && totalCount !== undefined ? ` ${matchCount}/${totalCount}` : ''}`}</Text>
      ) : null}
    </Box>
  );
}
