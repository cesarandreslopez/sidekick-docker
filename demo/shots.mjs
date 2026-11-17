#!/usr/bin/env node
/**
 * Capture the extra docs stills (directors/screenshots.mjs) into
 * out/screenshots/final/stills/, on a freshly seeded stack.
 *
 *   node shots.mjs                 then stop the sandbox daemon
 *   node shots.mjs --keep-daemon   leave it running
 */
import { join } from 'node:path';
import { DEMO_DIR, stopDaemon } from './lib/sandbox.mjs';
import { freshStack } from './lib/stack.mjs';
import { capture, warmupMs } from './directors/screenshots.mjs';

try {
  const paths = await freshStack({ log: (m) => console.log(`  ${m}`) });
  await new Promise((r) => setTimeout(r, warmupMs));
  const { leak, stills } = await capture({ outDir: join(DEMO_DIR, 'out', 'screenshots'), paths });
  console.log(leak.assertClean());
  console.log(stills.join('\n'));
} finally {
  if (!process.argv.includes('--keep-daemon')) stopDaemon();
}
