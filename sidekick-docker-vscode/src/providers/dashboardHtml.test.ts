import { describe, expect, it } from 'vitest';
import { getDashboardHtml } from './dashboardHtml';

const html = getDashboardHtml({ asWebviewUri: () => 'dashboard.js', cspSource: 'test' } as never, {} as never, 'nonce');
const css = /<style>([\s\S]*)<\/style>/.exec(html)?.[1] ?? '';

/** The declarations of the first rule whose selector list contains `selector`. */
function ruleFor(selector: string): string {
  const at = css.indexOf(selector);
  if (at < 0) throw new Error(`no rule for ${selector}`);
  return css.slice(css.indexOf('{', at), css.indexOf('}', at));
}

describe('dashboard CSS', () => {
  it('sets no text below 11px', () => {
    expect(css).not.toMatch(/font-size:\s*(?:[0-9]|10)(?:\.\d+)?px/);
  });

  it('draws keyboard focus on an active tab after the high-contrast selection outline', () => {
    const contrast = css.indexOf('outline: 1px solid var(--vscode-contrastActiveBorder, transparent)');
    const focus = css.indexOf('#tab-bar .tab:focus-visible');
    expect(contrast).toBeGreaterThan(0);
    expect(focus).toBeGreaterThan(contrast);
    expect(css).toContain('#detail-tab-bar .detail-tab:focus-visible');
    expect(ruleFor('#tab-bar .tab:focus-visible')).toContain('--vscode-focusBorder');
  });

  it('pairs the filter indicator\'s warning foreground with the warning background', () => {
    const rule = ruleFor('#status-bar .filter-indicator');
    expect(rule).toContain('--vscode-statusBarItem-warningForeground');
    expect(rule).toContain('--vscode-statusBarItem-warningBackground');
  });

  it('outlines focused status-bar chips with the status bar\'s own focus border', () => {
    expect(ruleFor('#status-bar .hint-chip:focus-visible')).toContain('--vscode-statusBarItem-focusBorder');
  });

  it('honours VS Code\'s reduce-motion setting as well as the OS preference, for every transition', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(ruleFor('body.vscode-reduce-motion *,')).toContain('transition-duration: 0.01ms !important');
    expect(ruleFor('body.vscode-reduce-motion *,')).toContain('animation-duration: 0.01ms !important');
  });
});
