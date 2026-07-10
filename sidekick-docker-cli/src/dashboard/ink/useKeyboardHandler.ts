import { useInput } from 'ink';
import { OVERLAY_INPUT_HANDLERS } from './overlayInput';
import type { OverlayInputContext } from './overlayInput';
import { GLOBAL_BINDINGS } from './keyRegistry';
import type { KeyContext } from './keyRegistry';
import { executeAction } from './executeAction';

export interface KeyboardHandlerProps {
  ctx: KeyContext;
  removeToast: (id: number) => void;
}

/**
 * Keyboard input router. Fixed dispatch order:
 * exec passthrough → Ctrl+C (always quits) → active overlay handler (consumes
 * everything, so text overlays receive characters like 'q') → global bindings
 * from the key registry → per-panel action shortcuts.
 */
export function useKeyboardHandler({ ctx, removeToast }: KeyboardHandlerProps): void {
  useInput((input, key) => {
    const { state, dispatch, addToast, selectedItem, applicableActions } = ctx;

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
      const actionMatch = applicableActions.find(a => a.key === input);
      if (actionMatch) {
        executeAction(actionMatch, selectedItem, dispatch, addToast, removeToast);
      }
    }
  });
}
