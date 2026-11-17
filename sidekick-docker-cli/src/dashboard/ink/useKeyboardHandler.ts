import { useInput } from 'ink';
import type { Key } from 'ink';
import { OVERLAY_INPUT_HANDLERS } from './overlayInput';
import type { OverlayInputContext } from './overlayInput';
import { findGlobalBinding, navigateBy } from './keyRegistry';
import type { KeyContext } from './keyRegistry';
import { executeAction, findPanelAction, unavailableActionText } from './executeAction';
import { navigationRun } from './inputText';
// Imported from the file, not './mouse': tests replace that barrel wholesale.
import { isMouseSequenceInput } from './mouse/parseMouseEvent';

export interface KeyboardHandlerProps {
  ctx: KeyContext;
  removeToast: (id: number) => void;
}

/**
 * Keyboard input router. Fixed dispatch order:
 * mouse reports (dropped) → exec passthrough → Ctrl+C (always quits) → too
 * small to draw (only q) → active overlay handler (consumes everything, so
 * text overlays receive characters like 'q') → a run of j/k → global
 * bindings from the key registry → per-panel action shortcuts (and a "not
 * available" toast for one whose condition fails).
 */
export function handleKeyInput(input: string, key: Key, ctx: KeyContext, removeToast: (id: number) => void): void {
  const { state, dispatch, addToast, selectedItem, applicableActions } = ctx;

  // Ink hands a mouse report to useInput as text ("[<0;12;5M"); left alone
  // it was typed into the / and f prompts, twice per click.
  if (isMouseSequenceInput(input)) return;

  if (state.overlay === 'exec') return;

  if (key.ctrl && input === 'c') {
    ctx.exit();
    return;
  }

  // Only the size warning is on screen: every other key acted on a dashboard
  // nobody could see (x opened a menu, d asked to remove something unseen).
  if (ctx.tooSmall) {
    if (input === 'q' && !key.ctrl && !key.meta) ctx.exit();
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

  // A held j/k can arrive as one chunk ("jjjj"): move by its length.
  const run = navigationRun(input);
  if (run !== 0) {
    navigateBy(ctx, run);
    return;
  }

  const spec = findGlobalBinding(input, key);
  if (spec) {
    if (spec.isAvailable && !spec.isAvailable(ctx)) {
      addToast('Not available here', 'warning', 1500);
      return;
    }
    spec.run(ctx, input, key);
    return;
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
}

export function useKeyboardHandler({ ctx, removeToast }: KeyboardHandlerProps): void {
  useInput((input, key) => {
    handleKeyInput(input, key, ctx, removeToast);
  });
}
