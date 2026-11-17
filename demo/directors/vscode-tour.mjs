/**
 * VS Code tour: the Containers tree beside the dashboard webview, live stats,
 * a Compose Restart from the tree with its output streaming into the "Sidekick
 * Docker" channel, and `e` opening a shell in the selected container.
 * See STORYBOARD.md.
 */
import { prepareVsCode, launchVsCode, runCommand, workbenchText, ensureViewport, VSCODE_VIEWPORT } from '../lib/vscode.mjs';
import { installOverlay, caption, clickAt, moveCursor, hideCursor, keycap } from '../lib/overlay.mjs';
import { Recorder } from '../lib/recorder.mjs';
import { LeakCheck } from '../lib/leakcheck.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
/** Progress lines with DEMO_DEBUG=1, for finding where a take stalls. */
const step = (what) => process.env.DEMO_DEBUG && console.log(`  [${((Date.now() - t0) / 1000).toFixed(1)}s] ${what}`);
const centre = (box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

/** The box of the first match that is actually on screen (hidden panels keep their own tabs in the DOM). */
async function visibleBox(locator) {
  for (const el of await locator.all()) {
    const box = await el.boundingBox().catch(() => null);
    if (box && box.width > 0 && box.height > 0) return box;
  }
  throw new Error(`no visible element for ${locator}`);
}

export const name = 'vscode-tour';
export const warmupMs = 20_000;

/** The dashboard webview's inner frame (webviews are nested iframes). */
async function dashboardFrame(win) {
  for (let attempt = 0; attempt < 60; attempt++) {
    for (const frame of win.frames()) {
      try {
        const text = await frame.evaluate(() => document.body?.innerText ?? '');
        if (text.includes('Patterns') && text.includes('Containers') && text.includes('Networks')) return frame;
      } catch {
        /* detached */
      }
    }
    await sleep(250);
  }
  throw new Error('dashboard webview not found');
}

async function waitInFrame(frame, needle, timeoutMs = 15_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const text = await frame.evaluate(() => document.body?.innerText ?? '').catch(() => '');
    if (text.includes(needle)) return;
    await sleep(200);
  }
  throw new Error(`"${needle}" never appeared in the dashboard`);
}

async function waitInWorkbench(win, needle, timeoutMs = 20_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if ((await workbenchText(win)).includes(needle)) return;
    await sleep(250);
  }
  throw new Error(`"${needle}" never appeared in the workbench`);
}

/** A tree row in the Sidekick Docker sidebar by its label (its text is the label, then the count/description). */
function treeRow(win, label) {
  return win.locator('.part.sidebar .monaco-list-row').filter({ hasText: new RegExp(`^${label}\\s*\\d*$`) }).first();
}

export async function record({ outDir, paths }) {
  step('install the extension');
  prepareVsCode(paths);
  step('launch VS Code');
  const { app, win } = await launchVsCode(paths);
  const leak = new LeakCheck(name);
  const sample = async (where) => leak.check(where, await workbenchText(win));
  try {
    await sleep(4_000);
    await runCommand(win, 'Notifications: Clear All Notifications', { settleMs: 300 });
    await runCommand(win, 'View: Close All Editors', { settleMs: 300 });

    step('open the Containers tree, expand storefront');
    await runCommand(win, 'Sidekick Docker: Focus on Containers View', { settleMs: 1_500 });
    await treeRow(win, 'storefront').waitFor({ timeout: 20_000 }).catch(async (error) => {
      const rows = await win.locator('.part.sidebar .monaco-list-row').allInnerTexts();
      throw new Error(`storefront row not found in the tree (rows: ${JSON.stringify(rows)}): ${error.message}`);
    });
    await treeRow(win, 'storefront').click();
    await sleep(800);

    step('open the dashboard');
    await runCommand(win, 'Sidekick Docker: Open Dashboard', { settleMs: 3_000 });
    const dash = await dashboardFrame(win);
    await waitInFrame(dash, 'storefront-api');

    // Warm the stats history so the sparklines are full when the Stats tab opens on camera.
    step('warm stats');
    const statsTab = dash.locator('[role="tab"]:text-is("Stats"), button:text-is("Stats")');
    const logsTab = dash.locator('[role="tab"]:text-is("Logs"), button:text-is("Logs")');
    await statsTab.filter({ visible: true }).first().click();
    await sleep(25_000);
    await logsTab.filter({ visible: true }).first().click();
    // Wide layout: the dashboard's own list gets room for full container names.
    await dash.locator('body').press('z');
    await waitInFrame(dash, 'Layout: Wide').catch(() => {});
    await sleep(3_500);
    await win.mouse.move(VSCODE_VIEWPORT.width - 30, VSCODE_VIEWPORT.height - 140);

    await ensureViewport(app, win); // VS Code can resize itself late in startup; the take must be 1440x810
    await sleep(1_000);
    const editorLeft = await win.evaluate(() => document.querySelector('.part.editor')?.getBoundingClientRect().left ?? 480);
    await installOverlay(win, { scale: 1, captionBottom: 56, captionX: (editorLeft + VSCODE_VIEWPORT.width) / 2 });
    await sample('ready');

    const rec = new Recorder(win, { dir: outDir, viewport: VSCODE_VIEWPORT });
    step('start recording');
    await rec.start();
    const stopWatch = leak.watch(() => workbenchText(win), 1_500);

    // 1. The tree and the dashboard, live.
    await sleep(300);
    await caption(win, 'Same dashboard, in VS Code');
    rec.still('vscode-dashboard', 1_500);
    await sleep(2_900);
    await sample('dashboard');

    // 2. Live stats.
    step('beat 2: Stats');
    const statsBox = await visibleBox(statsTab);
    await clickAt(win, centre(statsBox).x, centre(statsBox).y);
    await sleep(500);
    await caption(win, 'CPU and memory, live');
    rec.still('vscode-stats', 1_500);
    await sleep(2_600);
    await sample('stats');

    // 3. Compose Restart from the tree, output streaming. Back to Logs first: a
    // restart resets the container's CPU counter, and the Stats tab would show the
    // negative delta the CPU calculation produces across a restart.
    step('beat 3: Compose Restart');
    await caption(win, '');
    const logsBox = await visibleBox(logsTab);
    await clickAt(win, centre(logsBox).x, centre(logsBox).y, { ms: 500 });
    await sleep(400);
    const groupBox = await treeRow(win, 'storefront').boundingBox();
    await moveCursor(win, groupBox.x + 90, centre(groupBox).y, 700);
    await win.mouse.click(groupBox.x + 90, centre(groupBox).y, { button: 'right' });
    await sleep(600);
    const restart = win.locator('.monaco-menu .action-item:has-text("Compose Restart")').first();
    const restartBox = await restart.boundingBox();
    if (!restartBox) throw new Error('Compose Restart is not in the tree context menu');
    await clickAt(win, restartBox.x + 50, centre(restartBox).y, { ms: 500 });
    await caption(win, 'Compose from the tree');
    await sleep(800);
    await hideCursor(win);
    await keycap(win, '⌘⇧P');
    await runCommand(win, 'Output: Show Output Channels', { settleMs: 500 });
    await win.keyboard.type('Sidekick Docker', { delay: 18 });
    await sleep(350);
    await win.keyboard.press('Enter');
    await waitInWorkbench(win, 'storefront-api-1', 20_000);
    // In on the output panel: its text is too small to read at GIF size in the wide shot.
    const panel = await win.evaluate(() => {
      const r = document.querySelector('.part.panel')?.getBoundingClientRect();
      return r ? { left: r.left, bottom: r.bottom } : null;
    });
    if (panel) rec.shot({ x: panel.left, y: Math.max(0, panel.bottom - (900 * 9) / 16), w: 900 }, 800);
    await caption(win, ''); // it would sit over the zoomed output
    rec.still('vscode-compose-output', 1_800);
    await sleep(2_800);
    await sample('compose output');
    rec.wide(700);

    // 4. A shell in the selected container, one key.
    step('beat 4: exec');
    const firstRow = dash.locator('text=/storefront-api-1/');
    const rowBox = await visibleBox(firstRow);
    await clickAt(win, rowBox.x + 30, centre(rowBox).y, { ms: 600 });
    await sleep(500);
    await hideCursor(win);
    await keycap(win, 'e');
    await win.keyboard.press('e');
    await caption(win, 'A shell, one key');
    await waitInWorkbench(win, 'Exec: storefront-api', 15_000);
    await sleep(1_500);
    await win.keyboard.type('ls /app', { delay: 90 });
    await win.keyboard.press('Enter');
    rec.still('vscode-exec', 1_200);
    await sleep(2_400);
    await sample('exec');

    await caption(win, '');
    await sleep(500);
    step('stop recording');
    await stopWatch();
    await rec.stop();
    const inner = await win.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    if (inner.width !== VSCODE_VIEWPORT.width || inner.height !== VSCODE_VIEWPORT.height) throw new Error(`the window changed size during the take: ${inner.width}x${inner.height}`);
    return { recorder: rec, leak, encode: { name, loopFadeMs: 800, gifFps: 12, gifQuality: 82, gifMotionQuality: 60, gifLossyQuality: 60 } };
  } finally {
    await app.close().catch(() => {});
  }
}
