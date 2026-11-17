/**
 * Text-level leak check for recordings. Directors sample what is on screen (the
 * terminal buffer, the workbench and webview text) during a take; any sample that
 * names the real user, their home, a non-example.com address or a private project
 * fails the take before anything is encoded. Pass private names through
 * SK_DEMO_FORBIDDEN=a,b, never in this file. It does not replace looking at every
 * frame: pixels can leak what text extraction misses, and VS Code's integrated
 * terminal draws to a canvas, so its text is not in the samples at all.
 */
import os from 'node:os';

const EMAIL = /[A-Z0-9._%+-]+@([A-Z0-9-]+\.)+[A-Z]{2,}/gi;
const ALLOWED_EMAIL_DOMAINS = new Set(['example.com']);

function forbiddenNeedles() {
  const needles = new Set([os.homedir(), os.userInfo().username, os.hostname(), os.hostname().replace(/\.local$/, '')]);
  for (const extra of (process.env.SK_DEMO_FORBIDDEN ?? '').split(',')) if (extra.trim()) needles.add(extra.trim());
  // Never on screen in this footage: any macOS home folder, and Docker Desktop's own socket
  // and context (the sandbox daemon is on tcp).
  needles.add('/Users/');
  needles.add('.docker/run');
  needles.add('desktop-linux');
  const all = [...needles].filter(Boolean);
  const short = all.filter((n) => n.length < 4);
  if (short.length) {
    // A two-letter username cannot be searched for in on-screen text without false alarms;
    // say so rather than skip it silently, and look at the frames by hand.
    throw new Error(`leak check: ${short.map((n) => `"${n}"`).join(', ')} is too short to search for; review every frame by hand and pass longer names through SK_DEMO_FORBIDDEN`);
  }
  return all;
}

export class LeakCheck {
  constructor(label) {
    this.label = label;
    this.samples = 0;
    this.problems = [];
    this.needles = forbiddenNeedles();
  }

  check(where, text) {
    this.samples += 1;
    const lower = text.toLowerCase();
    for (const needle of this.needles) {
      if (lower.includes(needle.toLowerCase())) this.problems.push(`${where}: contains "${needle}"`);
    }
    for (const match of text.matchAll(EMAIL)) {
      const domain = match[0].split('@')[1].toLowerCase();
      if (!ALLOWED_EMAIL_DOMAINS.has(domain)) this.problems.push(`${where}: email ${match[0]}`);
    }
  }

  /**
   * Sample `read()` every `ms` until the returned stop() is called, so text that is
   * on screen only between two beats is checked too.
   */
  watch(read, ms = 1_000, where = 'during the take') {
    let stopped = false;
    const tick = async () => {
      while (!stopped) {
        try {
          this.check(where, await read());
        } catch {
          /* the page is closing */
        }
        await new Promise((r) => setTimeout(r, ms));
      }
    };
    const running = tick();
    return async () => {
      stopped = true;
      await running;
    };
  }

  assertClean() {
    if (this.samples === 0) throw new Error(`${this.label}: the leak check never sampled the screen`);
    if (this.problems.length) {
      const unique = [...new Set(this.problems)];
      throw new Error(`${this.label}: leak check failed:\n- ${unique.join('\n- ')}`);
    }
    return `${this.label}: leak check clean (${this.samples} samples)`;
  }
}
