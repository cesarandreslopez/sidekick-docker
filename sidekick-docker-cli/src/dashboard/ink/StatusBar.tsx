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
  resourceErrors?: Record<string, string>;
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
  /** Terminal width budget; segments are dropped lowest-priority-first to fit. */
  width: number;
}

function formatAgo(date: Date): { text: string; stale: boolean } {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 5) return { text: 'just now', stale: false };
  if (secs < 60) return { text: `${secs}s ago`, stale: false };
  const mins = Math.floor(secs / 60);
  return { text: `${mins}m ago`, stale: mins >= 1 };
}

const SEP = '│';

/** One colored text run in the status bar. Runs sharing a group are dropped together. */
export interface StatusSegment {
  group: string;
  text: string;
  color?: string;
  dimColor?: boolean;
  bold?: boolean;
}

/** Groups dropped (in this order) until the bar fits the width budget. */
const DROP_ORDER = ['tagline', 'version', 'brand', 'nav', 'context', 'ago', 'hints'];

export function buildStatusSegments(props: Omit<StatusBarProps, 'width'>, width: number): StatusSegment[] {
  const { daemonConnected, focusTarget, panelActionHints, filterString, containerCount, runningCount, version, matchCount, totalCount, lastRefresh, contextHint } = props;
  const ago = lastRefresh ? formatAgo(lastRefresh) : null;

  const segments: StatusSegment[] = [];

  segments.push({ group: 'brand', text: ` ${BRAND_INLINE}`, color: 'magenta', bold: true });
  segments.push({ group: 'tagline', text: ` ${BRAND_TAGLINE}`, color: 'gray', dimColor: true });
  segments.push({ group: 'version', text: ` v${version}`, color: 'gray', dimColor: true });
  segments.push({ group: 'daemon', text: ` ${SEP} `, color: 'gray', dimColor: true });
  segments.push(
    daemonConnected
      ? { group: 'daemon', text: `● ${runningCount ?? 0}/${containerCount ?? 0}`, color: 'green' }
      : { group: 'daemon', text: '○ disconnected', color: 'red' },
  );
  const failed = Object.keys(props.resourceErrors ?? {});
  if (failed.length) segments.push({ group: 'daemon', text: ` ⚠ ${failed.join(', ')} unavailable`, color: 'yellow' });
  if (ago) {
    segments.push({ group: 'ago', text: ` ↻ ${ago.text}`, color: ago.stale ? 'yellow' : 'gray', dimColor: !ago.stale });
  }

  if (panelActionHints.length > 0) {
    segments.push({ group: 'hints', text: ` ${SEP} `, color: 'gray', dimColor: true });
    panelActionHints.forEach((hint, i) => {
      if (i > 0) segments.push({ group: 'hints', text: '  ' });
      segments.push({ group: 'hints', text: `${hint.key}:${hint.label}`, color: hint.destructive ? 'red' : '#2B4C7E' });
    });
  }

  segments.push({ group: 'focus', text: ` ${SEP} `, color: 'gray', dimColor: true });
  segments.push({ group: 'focus', text: '◀', color: focusTarget === 'side' ? '#2B4C7E' : 'gray', bold: focusTarget === 'side' });
  segments.push({ group: 'focus', text: '/', color: 'gray', dimColor: true });
  segments.push({ group: 'focus', text: '▶', color: focusTarget === 'detail' ? '#2B4C7E' : 'gray', bold: focusTarget === 'detail' });

  segments.push({ group: 'nav', text: '  j/k  Tab  /  ?', color: 'gray', dimColor: true });

  if (contextHint) {
    segments.push({ group: 'context', text: `  ${contextHint}`, color: 'cyan', dimColor: true });
  }

  if (filterString) {
    const counts = matchCount !== undefined && totalCount !== undefined ? ` ${matchCount}/${totalCount}` : '';
    segments.push({ group: 'filter', text: `  ◉ "${filterString}"${counts}`, color: 'yellow', bold: true });
  }

  // Drop lowest-priority groups until the plain text fits the width budget.
  let result = segments;
  const fits = (segs: StatusSegment[]) => segs.reduce((n, s) => n + [...s.text].length, 0) <= width;
  for (const group of DROP_ORDER) {
    if (fits(result)) break;
    result = result.filter(s => s.group !== group);
  }
  return result;
}

export function StatusBar(props: StatusBarProps): React.ReactElement {
  // Re-render periodically to keep "ago" text fresh
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  const segments = buildStatusSegments(props, props.width);

  return (
    <Box width={props.width}>
      <Text wrap="truncate">
        {segments.map((s, i) => (
          <Text key={i} color={s.color} dimColor={s.dimColor} bold={s.bold}>{s.text}</Text>
        ))}
      </Text>
    </Box>
  );
}
