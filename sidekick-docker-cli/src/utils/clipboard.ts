import { execSync } from 'child_process';

export function copyToClipboard(text: string): boolean {
  try {
    if (process.platform === 'darwin') {
      execSync('pbcopy', { input: text });
    } else {
      try { execSync('xclip -selection clipboard', { input: text }); }
      catch {
        try { execSync('xsel --clipboard --input', { input: text }); }
        catch { execSync('wl-copy', { input: text }); }
      }
    }
    return true;
  } catch { return false; }
}
