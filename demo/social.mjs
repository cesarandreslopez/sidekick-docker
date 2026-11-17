#!/usr/bin/env node
/**
 * The GitHub social preview card (Settings → General → Social preview): 1280x640,
 * rendered from HTML with the current tagline and the hero still from the recordings.
 *
 *   node social.mjs     → out/social-preview.png (upload it by hand; GitHub has no API for it)
 *
 * Run it after `node record.mjs cli-dashboard`; `node sync.mjs` then copies the card
 * into assets/ and docs/ with the rest.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { DEMO_DIR, REPO_ROOT } from './lib/sandbox.mjs';

const dataUrl = (file, type) => `data:${type};base64,${readFileSync(file).toString('base64')}`;
const icon = dataUrl(join(REPO_ROOT, 'images', 'icon-256.png'), 'image/png');
const still = dataUrl(join(DEMO_DIR, 'out', 'cli-dashboard', 'final', 'stills', 'cli-containers.png'), 'image/png');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  html, body { margin: 0; width: 1280px; height: 640px; overflow: hidden; background: #12121a; }
  body { font-family: -apple-system, "SF Pro Display", "Helvetica Neue", sans-serif; color: #f2f0fa; position: relative; }
  .glow { position: absolute; inset: 0; background: radial-gradient(900px 500px at 85% 40%, rgba(91, 139, 217, 0.24), transparent 60%); }
  .left { position: absolute; left: 72px; top: 0; bottom: 0; width: 560px; display: flex; flex-direction: column; justify-content: center; }
  .brand { display: flex; align-items: center; gap: 18px; margin-bottom: 34px; }
  .brand img { width: 72px; height: 72px; border-radius: 16px; }
  .brand span { font-size: 34px; font-weight: 700; letter-spacing: -0.01em; }
  h1 { font-size: 52px; line-height: 1.08; margin: 0 0 26px; font-weight: 800; letter-spacing: -0.02em; }
  h1 em { font-style: normal; color: #7fa6e8; }
  p { font-size: 24px; line-height: 1.4; margin: 0; color: #b9b4cc; }
  .shot { position: absolute; right: -60px; top: 120px; width: 700px; border-radius: 14px; box-shadow: 0 30px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(91,139,217,0.35); }
</style></head><body>
  <div class="glow"></div>
  <div class="left">
    <div class="brand"><img src="${icon}" alt=""><span>Sidekick Docker</span></div>
    <h1>A live Docker dashboard, <em>in your terminal and VS Code.</em></h1>
    <p>Containers, Compose, logs and stats in one keyboard-driven view.</p>
  </div>
  <img class="shot" src="${still}" alt="">
</body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  const out = join(DEMO_DIR, 'out', 'social-preview.png');
  writeFileSync(out, await page.screenshot({ type: 'png' }));
  try {
    execFileSync('pngquant', ['--quality=85-98', '--force', '--ext', '.png', out], { stdio: 'ignore' });
  } catch {
    /* keep the unquantized card */
  }
  console.log(out);
} finally {
  await browser.close();
}
