import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';

interface ToastEntry {
  id: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

interface ToastNotificationProps {
  toast: ToastEntry;
}

const SEVERITY_COLORS: Record<string, string> = {
  error: 'red',
  warning: 'yellow',
  info: '#2B4C7E',
};

const SPINNER_FRAMES = '\u280B\u2819\u2839\u2838\u283C\u2834\u2826\u2827';

export function ToastNotification({ toast }: ToastNotificationProps): React.ReactElement {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (toast.severity !== 'info') return;
    const timer = setInterval(() => {
      setFrame(f => (f + 1) % SPINNER_FRAMES.length);
    }, 100);
    return () => clearInterval(timer);
  }, [toast.id, toast.severity]);

  const SEVERITY_ICONS: Record<string, string> = {
    error: '\u2717',    // ✗
    warning: '\u26A0',  // ⚠
    info: SPINNER_FRAMES[frame],
  };

  const icon = SEVERITY_ICONS[toast.severity] || '';

  // Warning uses black text for contrast against yellow bg
  const textColor = toast.severity === 'warning' ? 'black' : 'white';

  return (
    <Box position="absolute" marginTop={0} justifyContent="flex-end">
      <Text backgroundColor={SEVERITY_COLORS[toast.severity] || 'white'} color={textColor} bold>
        {` ${icon} ${toast.message} `}
      </Text>
    </Box>
  );
}
