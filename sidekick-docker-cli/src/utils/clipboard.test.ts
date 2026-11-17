import { describe, expect, it } from 'vitest';
import { clipboardAttempts, osc52Sequence } from './clipboard';

describe('clipboardAttempts (T38)', () => {
  it('uses pbcopy on macOS and clip.exe on Windows', () => {
    expect(clipboardAttempts('darwin', false, false).map(([bin]) => bin)).toEqual(['pbcopy']);
    expect(clipboardAttempts('win32', false, false).map(([bin]) => bin)).toEqual(['clip.exe']);
  });

  it('tries wl-copy first under Wayland, then the X11 tools', () => {
    expect(clipboardAttempts('linux', false, true).map(([bin]) => bin)).toEqual(['wl-copy', 'xclip', 'xsel']);
    expect(clipboardAttempts('linux', false, false).map(([bin]) => bin)).toEqual(['xclip', 'xsel']);
  });

  it('reaches the Windows clipboard from WSL', () => {
    expect(clipboardAttempts('linux', true, false)[0][0]).toBe('clip.exe');
  });
});

describe('osc52Sequence (T38)', () => {
  it('base64-encodes the text into a clipboard write', () => {
    expect(osc52Sequence('hi', false)).toBe(`\x1b]52;c;${Buffer.from('hi').toString('base64')}\x07`);
  });

  it('wraps it for tmux passthrough, doubling inner escapes', () => {
    const seq = osc52Sequence('hi', true);
    expect(seq.startsWith('\x1bPtmux;\x1b\x1b]52;c;')).toBe(true);
    expect(seq.endsWith('\x07\x1b\\')).toBe(true);
  });
});
