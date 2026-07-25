import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import type { ToastEntry } from './dashboardTypes';

interface ToastNotificationProps {
  toast: ToastEntry;
}

const SEVERITY_COLORS: Record<string, string> = {
  error: 'red',
  warning: 'yellow',
  info: '#2B4C7E',
  success: 'green',
};

const SEVERITY_ICONS: Record<string, string> = {
  error: '✗',
  warning: '⚠',
  info: 'ℹ',
  success: '✓',
};

const SPINNER_FRAMES = '⠋⠙⠹⠸⠼⠴⠦⠧';

export function ToastNotification({ toast }: ToastNotificationProps): React.ReactElement {
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

  return (
    <Box justifyContent="flex-end">
      <Text backgroundColor={SEVERITY_COLORS[toast.severity] || 'white'} color={textColor} bold wrap="truncate-end">
        {` ${icon} ${toast.message} `}
      </Text>
    </Box>
  );
}
