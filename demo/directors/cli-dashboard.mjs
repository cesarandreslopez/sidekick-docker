/**
 * Hero clip: the sidekick-docker dashboard on the storefront stack.
 *
 * Beats (see STORYBOARD.md): every container with live highlighted logs → the
 * unhealthy payments container's Config tab, showing why → the Services panel
 * with compose replicas and a not-created service → a container prune: the
 * confirm names the count, the toast reports what it reclaimed.
 */
import { installOverlay, caption } from '../lib/overlay.mjs';
import { Recorder } from '../lib/recorder.mjs';
import { LeakCheck } from '../lib/leakcheck.mjs';
import { TERMINAL_VIEWPORT } from '../lib/terminal.mjs';
import { navigateTo, openDashboard, press, selectByName, sleep, waitForText } from '../lib/tui.mjs';

export const name = 'cli-dashboard';
export const warmupMs = 30_000;

export async function record({ outDir, paths }) {
  const term = await openDashboard(paths);
  const leak = new LeakCheck(name);
  const sample = async (where) => leak.check(where, await term.screenText());
  const key = (k, label = k) => press(term, k, label);
  try {
    await selectByName(term, 'storefront-api-1');
    await sleep(3_500); // toasts gone, the log tail loaded and following
    await installOverlay(term.page, { scale: 2, captionBottom: 16 });
    await sample('containers (before)');

    const rec = new Recorder(term.page, { dir: outDir, viewport: TERMINAL_VIEWPORT });
    await rec.start();
    const stopWatch = leak.watch(() => term.screenText());

    await sleep(250);
    await caption(term.page, 'Every container, live');
    rec.still('cli-containers', 2_400);
    await sleep(3_400);
    await sample('containers');

    // Why is payments unhealthy? Its Config tab carries the last probe's output.
    await navigateTo(term, 'storefront-payments-1');
    await sleep(500);
    for (let i = 0; i < 3; i++) {
      await key(']');
      await sleep(220);
    }
    await waitForText(term, 'Last check:');
    // The caption first: the zoomed 16:9 crop leaves the caption band out of frame.
    await caption(term.page, "Why it's unhealthy");
    await sleep(900);
    rec.shot({ x: 848, y: 40, w: 1700 }, 900);
    rec.still('cli-health', 1_600);
    await sleep(3_000);
    await sample('payments config');
    rec.wide(700);

    // Compose: projects, replicas, and the service that was never created.
    await caption(term.page, ''); // a caption never outlives its view
    await key('2');
    await sleep(450);
    await key('j');
    await sleep(240);
    await key('j');
    await waitForText(term, 'Project:  storefront');
    await caption(term.page, 'Compose-aware');
    rec.still('cli-services', 1_400);
    await sleep(3_400);
    await sample('services');

    // A prune that says what it will remove, then what it reclaimed.
    await caption(term.page, '');
    await key('1');
    await sleep(500);
    await key('P');
    await waitForText(term, 'stopped containers?');
    await caption(term.page, 'Prune, safely');
    rec.still('cli-prune', 900);
    await sleep(1_900);
    await sample('prune confirm');
    await key('y');
    await waitForText(term, 'reclaimed', 15_000);
    await sleep(2_400);
    await sample('prune result');

    await caption(term.page, '');
    await sleep(500);
    await stopWatch();
    await rec.stop();
    return { recorder: rec, leak, encode: { name, loopFadeMs: 800, gifMotionQuality: 60, gifLossyQuality: 70 } };
  } finally {
    await term.close();
  }
}
