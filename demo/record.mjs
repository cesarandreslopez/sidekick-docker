#!/usr/bin/env node
/**
 * Record the README/docs demos.
 *
 *   node record.mjs                 every clip
 *   node record.mjs cli-dashboard   one clip (cli-dashboard, cli-logs, vscode-tour)
 *   node record.mjs --keep          keep raw frames after encoding
 *   node record.mjs --keep-daemon   leave the sandbox daemon running afterwards
 *
 * Each take starts from a freshly seeded stack on the sandbox daemon
 * (lib/stack.mjs), which must pass the preflight first; the take fails if the
 * leak check finds anything on screen, then encodes to out/<clip>/final/: MP4,
 * GIF, stills. `node sync.mjs` copies approved finals into assets/ and docs/.
 */
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { DEMO_DIR, stopDaemon } from './lib/sandbox.mjs';
import { freshStack } from './lib/stack.mjs';

const CLIPS = {
  'cli-dashboard': () => import('./directors/cli-dashboard.mjs'),
  'cli-logs': () => import('./directors/cli-logs.mjs'),
  'vscode-tour': () => import('./directors/vscode-tour.mjs'),
};

const args = process.argv.slice(2);
const keep = args.includes('--keep');
const wanted = args.filter((a) => !a.startsWith('--'));
const clips = wanted.length ? wanted : Object.keys(CLIPS);
for (const clip of clips) if (!CLIPS[clip]) throw new Error(`unknown clip "${clip}" (have: ${Object.keys(CLIPS).join(', ')})`);

try {
  for (const clip of clips) {
    const director = await CLIPS[clip]();
    const outDir = join(DEMO_DIR, 'out', clip);
    mkdirSync(outDir, { recursive: true });
    console.log(`● ${clip}: seeding the stack`);
    const paths = await freshStack({ log: (m) => console.log(`  ${m}`) });
    if (director.warmupMs) {
      // Let logs, failing checks and uptimes accumulate, so the take does not look freshly started.
      console.log(`  warming up for ${director.warmupMs / 1000}s`);
      await new Promise((r) => setTimeout(r, director.warmupMs));
    }
    console.log(`● ${clip}: recording`);
    const { recorder, leak, encode } = await director.record({ outDir, paths });
    console.log(`  ${leak.assertClean()}`);
    console.log(`  ${recorder.frames.length} frames over ${(recorder.durationMs / 1000).toFixed(1)}s; encoding`);
    const result = recorder.encode(encode);
    console.log(`  ${result.gif} (${result.gifMb} MB), ${result.stills.length} stills`);
    if (result.gifMb > 4) console.warn(`  ! ${clip}.gif is over the 4 MB budget`);
    if (!keep) rmSync(join(outDir, 'frames'), { recursive: true, force: true });
  }
} finally {
  if (!args.includes('--keep-daemon')) stopDaemon();
}
