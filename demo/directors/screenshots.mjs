/**
 * Stills the clips don't cover, for the docs: the Stats tab with full
 * sparklines, the Files tab, image layers, the help overlay, the exec fallback
 * an npm install gets, and the scriptable side (`df`, `ps --format json | jq`).
 * Same sandbox and stack as the clips. Writes 1600-px PNGs to
 * out/screenshots/final/stills/.
 */
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { ENDPOINT } from '../lib/sandbox.mjs';
import { openTerminal } from '../lib/terminal.mjs';
import { LeakCheck } from '../lib/leakcheck.mjs';
import { openDashboard, selectByName, sleep, waitForText } from '../lib/tui.mjs';

export const name = 'screenshots';
export const warmupMs = 30_000;

function toStill(src, dest) {
  execFileSync('sips', ['--resampleWidth', '1600', src, '--out', dest], { stdio: 'ignore' });
  rmSync(src, { force: true });
}

export async function capture({ outDir, paths }) {
  const stills = join(outDir, 'final', 'stills');
  const raw = join(outDir, 'raw');
  rmSync(stills, { recursive: true, force: true });
  mkdirSync(stills, { recursive: true });
  mkdirSync(raw, { recursive: true });
  const leak = new LeakCheck(name);
  const made = [];

  const snap = async (term, file, clip) => {
    leak.check(file, await term.screenText());
    await term.page.screenshot({ path: join(raw, `${file}.png`), ...(clip ? { clip } : {}) });
    toStill(join(raw, `${file}.png`), join(stills, `${file}.png`));
    made.push(`${file}.png`);
  };

  // Dashboard views.
  const term = await openDashboard(paths, { captionBand: 0 });
  try {
    await selectByName(term, 'storefront-api-1');
    await term.page.keyboard.press(']');
    await waitForText(term, 'Memory:');
    await sleep(40_000); // let the sparklines fill their 40 cells
    await snap(term, 'cli-stats');

    for (let i = 0; i < 4; i++) {
      await term.page.keyboard.press(']');
      await sleep(250);
    }
    await waitForText(term, '/app/cache/products.json');
    await sleep(800);
    await snap(term, 'cli-files');

    // Help on the Containers panel, which has the most actions to list.
    await term.page.keyboard.press('?');
    await sleep(900);
    await snap(term, 'cli-help');
    await term.page.keyboard.press('Escape');
    await sleep(400);

    await term.page.keyboard.press('3');
    await sleep(600);
    await term.page.keyboard.press('/');
    await term.page.keyboard.type('storefront/app', { delay: 20 });
    await term.page.keyboard.press('Enter');
    await sleep(500);
    await term.page.keyboard.press(']');
    await waitForText(term, 'Image Layers');
    await sleep(800);
    await snap(term, 'cli-layers');
    await term.page.keyboard.press('/');
    await term.page.keyboard.press('Escape');
    await sleep(3_500); // the "Filter cleared" toast fades

    // Exec as an npm install runs it: the dashboard steps aside for `docker exec -it`.
    await term.page.keyboard.press('1');
    await sleep(600);
    await selectByName(term, 'storefront-api-1');
    await term.page.keyboard.press('e');
    await waitForText(term, 'type exit to return', 15_000);
    await sleep(1_500);
    await term.page.keyboard.type('ls /app', { delay: 40 });
    await term.page.keyboard.press('Enter');
    await sleep(1_200);
    await snap(term, 'cli-exec-fallback', { x: 0, y: 0, width: 2560, height: 400 });
    await term.page.keyboard.type('exit', { delay: 40 });
    await term.page.keyboard.press('Enter');
    await waitForText(term, 'Containers (', 15_000);
  } finally {
    await term.close();
  }

  // The scriptable side, in a plain shell (DOCKER_HOST keeps the typed commands clean).
  const sh = await openTerminal(paths, ['/bin/sh'], { env: { DOCKER_HOST: ENDPOINT, PS1: '$ ' }, captionBand: 0 });
  try {
    await sleep(800);
    const run = async (cmd) => {
      await sh.page.keyboard.type(cmd, { delay: 8 });
      await sh.page.keyboard.press('Enter');
      await sleep(2_500);
    };
    await run('sidekick-docker df');
    await snap(sh, 'cli-df', { x: 0, y: 0, width: 2560, height: 560 });
    await run('clear');
    await run(`sidekick-docker ps -a --format json | jq -r '.[] | select(.state == "exited") | [.name, .status] | @tsv'`);
    await snap(sh, 'cli-ps-json', { x: 0, y: 0, width: 2560, height: 560 });
  } finally {
    await sh.close();
  }

  return { leak, stills: made };
}
