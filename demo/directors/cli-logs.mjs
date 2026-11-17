/**
 * Logs clip: what the dashboard does with a container's logs.
 *
 * Beats (see STORYBOARD.md): filter as you type, with matches highlighted and
 * counted → the Patterns tab, where repeated lines collapse into templates →
 * compare: the api's checkout errors beside the payments timeouts behind them.
 * No camera moves here: an eased zoom changes every pixel of every frame, which
 * is what makes a GIF heavy, and the full frame already reads at README size.
 */
import { installOverlay, caption, keycap } from '../lib/overlay.mjs';
import { Recorder } from '../lib/recorder.mjs';
import { LeakCheck } from '../lib/leakcheck.mjs';
import { TERMINAL_VIEWPORT } from '../lib/terminal.mjs';
import { openDashboard, press, selectByName, sleep, waitForText } from '../lib/tui.mjs';

export const name = 'cli-logs';
export const warmupMs = 60_000;

export async function record({ outDir, paths }) {
  const term = await openDashboard(paths);
  const leak = new LeakCheck(name);
  const sample = async (where) => leak.check(where, await term.screenText());
  const key = (k, label = k) => press(term, k, label);
  try {
    await selectByName(term, 'storefront-api-1');
    await sleep(4_000);
    await installOverlay(term.page, { scale: 2, captionBottom: 16 });
    await sample('logs (before)');

    const rec = new Recorder(term.page, { dir: outDir, viewport: TERMINAL_VIEWPORT });
    await rec.start();
    const stopWatch = leak.watch(() => term.screenText());
    await sleep(1_400);

    // Filter as you type: every keystroke re-filters and re-counts.
    await key('f');
    await sleep(350);
    await keycap(term.page, 'error');
    await term.page.keyboard.type('error', { delay: 130 });
    await caption(term.page, 'Filter as you type');
    await waitForText(term, 'matches (exact)');
    await sleep(700);
    await key('Enter', '⏎');
    rec.still('cli-filter', 1_200);
    await sleep(2_800);
    await sample('filter');

    // Patterns: repeated lines collapse into templates with their counts.
    await caption(term.page, ''); // a caption never outlives its view
    await key('[');
    await waitForText(term, 'Top Log Patterns');
    await caption(term.page, 'Repeated lines, grouped');
    rec.still('cli-patterns', 1_500);
    await sleep(3_200);
    await sample('patterns');

    // Compare: pin the api, then jump straight to payments with the list filter
    // (stepping down the list would flash other containers' lines under the next name).
    await caption(term.page, '');
    await key(']');
    await sleep(500);
    await key('m');
    await sleep(700);
    await key('/');
    await sleep(250);
    await keycap(term.page, 'payments');
    await term.page.keyboard.type('payments', { delay: 90 });
    await sleep(300);
    await key('Enter', '⏎');
    await waitForText(term, /storefront-payments-1\s+│ storefront-api-1/);
    // Expanded gives each stream half the full width (Wide leaves ~40 columns each).
    await sleep(400);
    await key('z');
    await waitForText(term, 'z: Expanded');
    await caption(term.page, 'Two streams, side by side');
    rec.still('cli-compare', 1_600);
    await sleep(3_800);
    await sample('compare');

    await caption(term.page, '');
    await sleep(500);
    await stopWatch();
    await rec.stop();
    return { recorder: rec, leak, encode: { name, loopFadeMs: 800 } };
  } finally {
    await term.close();
  }
}
