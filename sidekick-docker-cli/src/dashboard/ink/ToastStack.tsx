import React from 'react';
import { Box } from 'ink';
import type { ToastEntry } from './dashboardTypes';
import { ToastNotification } from './ToastNotification';

const MAX_VISIBLE_TOASTS = 3;

interface ToastStackProps {
  toasts: ToastEntry[];
  width: number;
}

/**
 * Right-anchored column of the most recent toasts, rendered below the tab bar
 * so concurrent action results stack instead of overwriting each other.
 */
export function ToastStack({ toasts, width }: ToastStackProps): React.ReactElement | null {
  const visible = toasts.slice(-MAX_VISIBLE_TOASTS);
  if (visible.length === 0) return null;

  return (
    <Box position="absolute" marginTop={1} width={width} flexDirection="column" alignItems="flex-end">
      {visible.map(toast => (
        <ToastNotification key={toast.id} toast={toast} />
      ))}
    </Box>
  );
}
