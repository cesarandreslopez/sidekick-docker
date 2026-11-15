import { useInput } from 'ink';
import { OVERLAY_INPUT_HANDLERS } from './overlayInput';
import type { OverlayInputContext } from './overlayInput';
import { GLOBAL_BINDINGS } from './keyRegistry';
import type { KeyContext } from './keyRegistry';
import { executeAction, findPanelAction, unavailableActionText } from './executeAction';
// Imported from the file, not './mouse': tests replace that barrel wholesale.
import { isMouseSequenceInput } from './mouse/parseMouseEvent';

export interface KeyboardHandlerProps {
  ctx: KeyContext;
  removeToast: (id: number) => void;
}

/**
 * Keyboard input router. Fixed dispatch order:
 * mouse reports (dropped) → exec passthrough → Ctrl+C (always quits) → active
 * overlay handler (consumes everything, so text overlays receive characters
 * like 'q') → global bindings from the key registry → per-panel action
 * shortcuts (and a "not available" toast for one whose condition fails).
 */
export function useKeyboardHandler({ ctx, removeToast }: KeyboardHandlerProps): void {
  useInput((input, key) => {
    const { state, dispatch, addToast, selectedItem, applicableActions } = ctx;

    // Ink hands a mouse report to useInput as text ("[<0;12;5M"); left alone
    // it was typed into the / and f prompts, twice per click.
    if (isMouseSequenceInput(input)) return;

    if (state.overlay === 'exec') return;

    if (key.ctrl && input === 'c') {
      ctx.exit();
      return;
    }

    if (state.overlay) {
      const overlayCtx: OverlayInputContext = {
        state,
        dispatch,
        selectedItem,
        addToast,
        removeToast,
        contextActions: state.overlay === 'context-menu' ? applicableActions : [],
        helpMaxScroll: ctx.helpMaxScroll,
      };
      OVERLAY_INPUT_HANDLERS[state.overlay](input, key, overlayCtx);
      return;
    }

    for (const spec of GLOBAL_BINDINGS) {
      if (spec.match(input, key)) {
        if (spec.isAvailable && !spec.isAvailable(ctx)) {
          addToast('Not available here', 'warning', 1500);
          return;
        }
        spec.run(ctx, input, key);
        return;
      }
    }

    if (selectedItem) {
      const actionMatch = findPanelAction(applicableActions, input, key);
      if (actionMatch) {
        executeAction(actionMatch, selectedItem, dispatch, addToast, removeToast);
        return;
      }
      // The panel has this key, just not for this item (e.g. Stop on a
      // stopped container): say so instead of doing nothing.
      const unavailable = unavailableActionText(ctx.panel.getActions(), input, key, selectedItem);
      if (unavailable) addToast(unavailable, 'warning');
    }
  });
}
