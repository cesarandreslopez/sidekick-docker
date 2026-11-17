/**
 * Helpers for driving the real sidekick-docker TUI inside a demo terminal
 * (lib/terminal.mjs): waiting for text, pressing keys with a keycap chip, and
 * selecting a row by name. Every assertion reads the xterm buffer, so a take
 * fails loudly when the dashboard is not where the script expects it.
 */
import { keycap } from './overlay.mjs';
import { ENDPOINT, ensureCli } from './sandbox.mjs';
import { openTerminal } from './terminal.mjs';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function waitForText(term, needle, timeoutMs = 20_000) {
  const end = Date.now() + timeoutMs;
  const test = typeof needle === 'string' ? (t) => t.includes(needle) : (t) => needle.test(t);
  while (Date.now() < end) {
    if (test(await term.screenText())) return;
    await sleep(150);
  }
  throw new Error(`timed out waiting for ${needle} on screen:\n${await term.screenText()}`);
}

export async function waitForGone(term, needle, timeoutMs = 10_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (!(await term.screenText()).includes(needle)) return;
    await sleep(150);
  }
  throw new Error(`"${needle}" is still on screen after ${timeoutMs} ms`);
}

/** Press a key; with `label`, show it as a keycap chip first (no label → no chip). */
export async function press(term, key, label) {
  if (label) await keycap(term.page, label);
  await term.page.keyboard.press(key);
}

/**
 * The side list's rows, parsed from the buffer: `{ name, selected }` for every
 * line inside the list box (the left `┃`/`│` border) that has a state icon.
 */
export async function listRows(term) {
  const rows = [];
  for (const line of (await term.screenText()).split('\n')) {
    const m = /^[┃│](>?)\s*(?:▶|■|❚❚|○|▷)\s+(\S+)/.exec(line);
    if (m) rows.push({ name: m[2], selected: m[1] === '>' });
  }
  return rows;
}

/** The name on the selected (`>`) row of the side list (Wide layout shows names in full). */
export async function selectedRow(term) {
  return (await listRows(term)).find((r) => r.selected)?.name ?? null;
}

/** Step the selection with j/k (shown as keycaps) until `name` is selected. */
export async function navigateTo(term, name, { gap = 260 } = {}) {
  for (let i = 0; i < 30; i++) {
    const rows = await listRows(term);
    const from = rows.findIndex((r) => r.selected);
    const to = rows.findIndex((r) => r.name === name);
    if (to < 0) throw new Error(`"${name}" is not in the list: ${rows.map((r) => r.name).join(', ')}`);
    if (from === to) return;
    await press(term, to > from ? 'j' : 'k', to > from ? 'j' : 'k');
    await sleep(gap);
  }
  throw new Error(`could not select "${name}"`);
}

/**
 * Select a row by name before a take: filter the list down to it, then clear the
 * filter. The dashboard keeps its selection by id, so the row stays selected.
 */
export async function selectByName(term, name) {
  await term.page.keyboard.press('/');
  await sleep(200);
  await term.page.keyboard.type(name, { delay: 20 });
  await sleep(400);
  await term.page.keyboard.press('Enter');
  await sleep(300);
  await term.page.keyboard.press('/');
  await sleep(200);
  await term.page.keyboard.press('Escape');
  await sleep(600);
  const row = await selectedRow(term);
  if (row !== name) throw new Error(`expected "${name}" selected, got "${row}"`);
}

/**
 * Open the dashboard the way an npm install runs it, against the sandbox daemon,
 * from the project folder (so `docker compose config` finds the planned services).
 */
export async function openDashboard(paths, { captionBand = 170, wide = true } = {}) {
  const bin = ensureCli(paths);
  const term = await openTerminal(paths, [bin, '--socket', ENDPOINT], { captionBand });
  try {
    await waitForText(term, 'Containers (');
    await waitForText(term, /Containers \(\d+\/16\)/, 20_000);
    if (wide) {
      await term.page.keyboard.press('z');
      await waitForText(term, 'z: Wide');
    }
    return term;
  } catch (error) {
    await term.close();
    throw error;
  }
}
