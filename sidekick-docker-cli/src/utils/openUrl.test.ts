import { describe, expect, it } from 'vitest';
import { openerCommand, openUrl } from './openUrl';

describe('openerCommand', () => {
  it('uses the platform opener with the URL as a single argument', () => {
    const url = 'http://localhost:8080/?a=1&b=2';
    expect(openerCommand('linux', url)).toEqual({ cmd: 'xdg-open', args: [url] });
    expect(openerCommand('darwin', url)).toEqual({ cmd: 'open', args: [url] });
    expect(openerCommand('win32', url)).toEqual({ cmd: 'rundll32', args: ['url.dll,FileProtocolHandler', url] });
  });
});

describe('openUrl', () => {
  it('refuses anything but http(s)', async () => {
    await expect(openUrl('file:///etc/passwd')).rejects.toThrow(/refusing/);
    await expect(openUrl('javascript:alert(1)')).rejects.toThrow(/refusing/);
    await expect(openUrl('not a url')).rejects.toThrow(/not a URL/);
  });
});
