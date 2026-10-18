import { spawn } from 'child_process';

/** The platform's "open this URL" command, run without a shell. */
export function openerCommand(platform: NodeJS.Platform, url: string): { cmd: string; args: string[] } {
  switch (platform) {
    case 'darwin': return { cmd: 'open', args: [url] };
    // rundll32 rather than `cmd /c start`: no shell, so nothing in the URL is interpreted.
    case 'win32': return { cmd: 'rundll32', args: ['url.dll,FileProtocolHandler', url] };
    default: return { cmd: 'xdg-open', args: [url] };
  }
}

/**
 * Open an http(s) URL in the user's browser. Detached, so closing the
 * dashboard does not take the browser with it. Rejects for any other scheme
 * and when no opener is installed.
 */
export function openUrl(url: string, platform: NodeJS.Platform = process.platform): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return Promise.reject(new Error(`not a URL: ${url}`));
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return Promise.reject(new Error(`refusing to open ${parsed.protocol} URL`));
  }
  const { cmd, args } = openerCommand(platform, parsed.toString());
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
    child.once('error', (err: NodeJS.ErrnoException) => {
      reject(err.code === 'ENOENT' ? new Error(`no browser opener found (${cmd})`) : err);
    });
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}
