import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import type { ToastEntry } from './dashboardTypes';
import { wrapToast, toastMaxLines } from './toastLayout';
import { ACCENT_FILL } from '../../theme';

interface ToastNotificationProps {
  toast: ToastEntry;
  /** Columns available, badge padding included. */
  maxWidth?: number;
}

const SEVERITY_COLORS: Record<string, string> = {
  error: 'red',
  warning: 'yellow',
  info: ACCENT_FILL,
  success: 'green',
};

const SEVERITY_ICONS: Record<string, string> = {
  error: '✗',
  warning: '⚠',
  info: 'ℹ',
  success: '✓',
};

const SPINNER_FRAMES = '⠋⠙⠹⠸⠼⠴⠦⠧';

export function ToastNotification({ toast, maxWidth = 80 }: ToastNotificationProps): React.ReactElement {
  const [frame, setFrame] = useState(0);

  // Spinner animates only for in-flight (progress) toasts.
  useEffect(() => {
    if (!toast.progress) return;
    const timer = setInterval(() => {
      setFrame(f => (f + 1) % SPINNER_FRAMES.length);
    }, 100);
    return () => clearInterval(timer);
  }, [toast.id, toast.progress]);

  const icon = toast.progress ? SPINNER_FRAMES[frame] : (SEVERITY_ICONS[toast.severity] || '');

  // Warning uses black text for contrast against yellow bg
  const textColor = toast.severity === 'warning' ? 'black' : 'white';

  // Errors, warnings and info wrap to three lines so the reason is readable.
  const lines = wrapToast(toast.message, maxWidth - 5, toastMaxLines(toast.severity));
  const width = Math.max(...lines.map(l => l.length));
  return (
    <Box flexDirection="column" alignItems="flex-end">
      {lines.map((line, i) => (
        <Text key={i} backgroundColor={SEVERITY_COLORS[toast.severity] || 'white'} color={textColor} bold wrap="truncate-end">
          {` ${i === 0 ? icon : ' '} ${line.padEnd(width)} `}
        </Text>
      ))}
    </Box>
  );
}
