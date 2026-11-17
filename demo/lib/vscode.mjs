/**
 * The real VS Code, driven by Playwright, inside the demo sandbox.
 *
 * The extension is installed from its packaged .vsix into the sandbox's own
 * extensions folder (an --extensionDevelopmentPath window titles itself
 * "[Extension Development Host]"), with throwaway user data and seeded settings,
 * so none of your extensions, accounts or settings appear. VSCODE_CLI=1 stops VS
 * Code re-reading the environment from a login shell, so the sandbox HOME and
 * DOCKER_CONFIG reach the extension host unchanged. The extension talks to the
 * sandbox daemon through its own socketPath setting.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { _electron as electron } from 'playwright';
import { DEMO_DIR, ENDPOINT, REPO_ROOT, sandboxEnv } from './sandbox.mjs';

const APP = '/Applications/Visual Studio Code.app';
const CODE_BIN = join(APP, 'Contents/MacOS/Code');
const CODE_CLI = join(APP, 'Contents/Resources/app/bin/code');
const VSCE = join(DEMO_DIR, 'node_modules/.bin/vsce');
export const VSCODE_VIEWPORT = { width: 1440, height: 810 };

const mtime = (p) => (existsSync(p) ? statSync(p).mtimeMs : 0);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Package the extension when its inputs changed. vsce runs vscode:prepublish (a production build), so build shared first. */
export function ensureVsix() {
  const outDir = join(DEMO_DIR, 'out', 'vsix');
  mkdirSync(outDir, { recursive: true });
  const extDir = join(REPO_ROOT, 'sidekick-docker-vscode');
  const version = JSON.parse(readFileSync(join(extDir, 'package.json'), 'utf8')).version;
  const vsix = join(outDir, `sidekick-docker-vscode-${version}.vsix`);
  const newestSource = Math.max(mtime(join(extDir, 'package.json')), mtime(join(extDir, 'README.md')), mtime(join(extDir, 'src')), mtime(join(extDir, 'out/extension.js')));
  if (mtime(vsix) < newestSource) {
    for (const f of readdirSync(outDir)) if (f.endsWith('.vsix')) rmSync(join(outDir, f));
    execFileSync(VSCE, ['package', '-o', vsix], { cwd: extDir, stdio: ['ignore', 'ignore', 'inherit'] });
  }
  return { sidekick: vsix };
}

/** Install the extension into the sandbox and write its user settings. */
export function prepareVsCode(paths, { settings = {} } = {}) {
  const { sidekick } = ensureVsix();
  execFileSync(
    CODE_CLI,
    ['--user-data-dir', paths.vscodeUserData, '--extensions-dir', paths.vscodeExtensions, '--install-extension', sidekick, '--force'],
    { env: sandboxEnv(paths, { VSCODE_CLI: '1', NODE_OPTIONS: '' }), stdio: ['ignore', 'ignore', 'inherit'] },
  );
  // Fresh user data every take: a remembered layout (an open sidebar, a closed view) would change the footage.
  rmSync(paths.vscodeUserData, { recursive: true, force: true });
  const userDir = join(paths.vscodeUserData, 'User');
  mkdirSync(userDir, { recursive: true });
  writeFileSync(
    join(userDir, 'settings.json'),
    JSON.stringify(
      {
        'workbench.colorTheme': 'Default Dark Modern',
        'workbench.startupEditor': 'none',
        'workbench.tips.enabled': false,
        'workbench.enableExperiments': false,
        'workbench.welcomePage.walkthroughs.openOnInstall': false,
        'workbench.secondarySideBar.defaultVisibility': 'hidden',
        'workbench.layoutControl.enabled': false,
        'window.commandCenter': true,
        // Custom (DOM) menus: a native macOS context menu is invisible to the screencast and to Playwright.
        'window.menuStyle': 'custom',
        'window.restoreWindows': 'none',
        'window.title': '${rootName}',
        'editor.minimap.enabled': false,
        'telemetry.telemetryLevel': 'off',
        'update.mode': 'none',
        'extensions.autoCheckUpdates': false,
        'extensions.autoUpdate': false,
        'extensions.ignoreRecommendations': true,
        'security.workspace.trust.enabled': false,
        'chat.disableAIFeatures': true,
        'git.enabled': false,
        'scm.diffDecorations': 'none',
        'terminal.integrated.fontSize': 13,
        'terminal.integrated.enablePersistentSessions': false,
        'workbench.panel.defaultLocation': 'bottom',
        'sidekick-docker.socketPath': ENDPOINT,
        ...settings,
      },
      null,
      2,
    ),
  );
}

/** Launch VS Code on the demo project, retrying once (a cold first start can be slow). Returns { app, win }. */
export async function launchVsCode(paths) {
  try {
    return await launchOnce(paths);
  } catch (error) {
    console.warn(`  VS Code did not start (${error.message.split('\n')[0]}); retrying once`);
    return launchOnce(paths);
  }
}

async function launchOnce(paths) {
  const env = sandboxEnv(paths, { VSCODE_CLI: '1' });
  const app = await electron.launch({
    executablePath: CODE_BIN,
    args: [
      paths.project,
      `--user-data-dir=${paths.vscodeUserData}`,
      `--extensions-dir=${paths.vscodeExtensions}`,
      '--disable-workspace-trust',
      '--skip-welcome',
      '--skip-release-notes',
      '--disable-telemetry',
      '--disable-updates',
      '--new-window',
    ],
    env,
    timeout: 90_000,
  });
  // The first window Electron reports is not always the workbench; wait for the one that is.
  let win = null;
  const deadline = Date.now() + 60_000;
  while (!win && Date.now() < deadline) {
    for (const candidate of app.windows()) {
      if (await candidate.$('.monaco-workbench').catch(() => null)) win = candidate;
    }
    if (!win) await sleep(500);
  }
  if (!win) {
    await app.close().catch(() => {});
    throw new Error('no VS Code workbench window within 60 s');
  }
  try {
    await ensureViewport(app, win);
  } catch (error) {
    await app.close().catch(() => {});
    throw error;
  }
  return { app, win };
}

/**
 * Size the workbench window itself (getAllWindows()[0] is not always it) to
 * VSCODE_VIEWPORT and check that it took. Call it at launch and again right
 * before recording: with fresh user data VS Code applies its default window size
 * late in startup, and the encoder crops a 16:9 region from the top of the frame,
 * so a taller window silently loses its bottom (status bar, captions).
 */
export async function ensureViewport(app, win) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const inner = await win.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    if (inner.width === VSCODE_VIEWPORT.width && inner.height === VSCODE_VIEWPORT.height) return;
    await app.evaluate(({ BrowserWindow }, size) => {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.webContents.getURL().includes('workbench')) continue;
        if (w.isFullScreen()) w.setFullScreen(false);
        if (w.isMaximized()) w.unmaximize();
        w.setContentSize(size.width, size.height);
        w.center();
      }
    }, VSCODE_VIEWPORT);
    await sleep(700);
  }
  const inner = await win.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  throw new Error(`the VS Code window is ${inner.width}x${inner.height}, not ${VSCODE_VIEWPORT.width}x${VSCODE_VIEWPORT.height}`);
}

/** Run a command from the palette. */
export async function runCommand(win, title, { settleMs = 1_200 } = {}) {
  await win.keyboard.press('Meta+Shift+P');
  await win.waitForSelector('.quick-input-widget:not(.hidden) input', { timeout: 10_000 });
  await win.keyboard.type(title, { delay: 12 });
  await sleep(450);
  await win.keyboard.press('Enter');
  await sleep(settleMs);
}

/** All visible text in the workbench and every webview frame (for the leak check). */
export async function workbenchText(win) {
  const parts = [];
  for (const frame of win.frames()) {
    try {
      parts.push(await frame.evaluate(() => document.body?.innerText ?? ''));
    } catch {
      /* frame went away */
    }
  }
  return parts.join('\n');
}
