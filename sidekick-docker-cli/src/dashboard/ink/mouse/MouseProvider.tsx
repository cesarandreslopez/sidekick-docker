/**
 * React component that enables terminal mouse tracking and dispatches
 * parsed mouse events via a callback prop. No context — just stdin parsing.
 */

import React, { useEffect, useRef } from 'react';
import { useInput } from 'ink';
import { enableMouse, disableMouse } from './mouseProtocol';
import { parseMouseEvents } from './parseMouseEvent';
import type { TerminalMouseEvent } from './parseMouseEvent';

interface MouseProviderProps {
  onMouse: (event: TerminalMouseEvent) => void;
  /**
   * Whether mouse tracking is on. Off while an embedded exec session owns the
   * terminal: clicks must neither reach the dashboard nor be typed into the
   * shell as escape sequences.
   */
  enabled?: boolean;
  children: React.ReactNode;
}

/**
 * Dummy component that calls useInput to consume raw stdin data,
 * preventing mouse escape sequences from echoing as garbage text.
 */
function InputSink(): null {
  useInput(() => {});
  return null;
}

export function MouseProvider({ onMouse, enabled = true, children }: MouseProviderProps): React.ReactElement {
  // The handler changes on nearly every render. Subscribing through a ref keeps
  // the effect below from tearing down and re-enabling mouse tracking each
  // time — which used to switch tracking back on mid-exec.
  const onMouseRef = useRef(onMouse);
  useEffect(() => { onMouseRef.current = onMouse; }, [onMouse]);

  useEffect(() => {
    if (!enabled) return;
    enableMouse();

    const handler = (data: Buffer) => {
      for (const event of parseMouseEvents(data)) onMouseRef.current(event);
    };

    process.stdin.on('data', handler);

    // Safety net: disable mouse on process exit even if unmount doesn't fire
    const exitHandler = () => disableMouse();
    process.on('exit', exitHandler);

    return () => {
      process.stdin.removeListener('data', handler);
      process.removeListener('exit', exitHandler);
      disableMouse();
    };
  }, [enabled]);

  return (
    <>
      <InputSink />
      {children}
    </>
  );
}
