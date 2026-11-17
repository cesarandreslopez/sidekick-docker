/**
 * Copy text to the system clipboard (Copy Logs).
 *
 * Ported from sidekick-agent-hub's clipboard helper, itself adapted from
 * `trawl` by Juan Fourie (B33pBeeps), MIT licensed:
 * https://github.com/B33pBeeps/trawl
 *
 * The old version ran each tool through execSync with piped stdout: xclip
 * and wl-copy fork a child that keeps serving the selection, holding that
 * pipe open, so the dashboard froze until the child exited. WSL (clip.exe)
 * and terminals reached over SSH had no path at all.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** How long one clipboard tool may take before the next is tried. */
const TOOL_TIMEOUT_MS = 2_000;

/** The clipboard tools to try, in order, for a platform. */
export function clipboardAttempts(platform: NodeJS.Platform, wsl: boolean, wayland: boolean): Array<[string, string[]]> {
  const attempts: Array<[string, string[]]> = [];
  if (platform === 'darwin') attempts.push(['pbcopy', []]);
  else if (platform === 'win32' || wsl) attempts.push(['clip.exe', []]);
  // Under Wayland, xclip/xsel only reach XWayland clients.
  if (wayland) attempts.push(['wl-copy', []]);
  if (platform !== 'win32' && platform !== 'darwin') {
    attempts.push(['xclip', ['-selection', 'clipboard']], ['xsel', ['--clipboard', '--input']]);
  }
  return attempts;
}

function isWSL(): boolean {
  try {
    return /microsoft/i.test(readFileSync('/proc/version', 'utf8'));
  } catch {
    return false;
  }
}

/** Run each tool until one succeeds. stdout/stderr are ignored so a forking tool cannot hold a pipe open. */
function nativeCopy(text: string): boolean {
  for (const [bin, args] of clipboardAttempts(process.platform, process.platform === 'linux' && isWSL(), Boolean(process.env.WAYLAND_DISPLAY))) {
    const result = spawnSync(bin, args, { input: text, stdio: ['pipe', 'ignore', 'ignore'], timeout: TOOL_TIMEOUT_MS });
    if (!result.error && result.status === 0) return true;
  }
  return false;
}

/**
 * The OSC 52 "set clipboard" sequence for `text`, wrapped for tmux's
 * passthrough when inside tmux.
 */
export function osc52Sequence(text: string, tmux: boolean): string {
  const sequence = `\x1b]52;c;${Buffer.from(text, 'utf8').toString('base64')}\x07`;
  if (!tmux) return sequence;
  return `\x1bPtmux;${sequence.split('\x1b').join('\x1b\x1b')}\x1b\\`;
}

/**
 * Ask the terminal to set the clipboard (OSC 52): the only route over SSH or
 * in a container with no clipboard tool. Written to stdout — the stream Ink
 * draws on — so it cannot interleave with a frame; the sequence prints
 * nothing and leaves the cursor where it is, so Ink's frame is unaffected.
 * Only on a TTY. The terminal sends no reply, so this cannot confirm the copy.
 */
function osc52Copy(text: string, stdout: NodeJS.WriteStream = process.stdout): boolean {
  if (!stdout.isTTY) return false;
  try {
    stdout.write(osc52Sequence(text, Boolean(process.env.TMUX)));
    return true;
  } catch {
    return false;
  }
}

/**
 * Copy `text`: a native clipboard tool when one works, else OSC 52 through
 * the terminal (not on Windows, whose console does not support it).
 */
export function copyToClipboard(text: string): boolean {
  return nativeCopy(text) || (process.platform !== 'win32' && osc52Copy(text));
}
