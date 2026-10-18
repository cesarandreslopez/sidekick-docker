import { describe, expect, it } from 'vitest';
import { escapeHtml, escapeAttr, optionAccessibleName, rovingTabIndex, buildStatusHints } from './formatters';

describe('escapeHtml', () => {
  it('escapes &, < and >', () => {
    expect(escapeHtml('<b>a & b</b>')).toBe('&lt;b&gt;a &amp; b&lt;/b&gt;');
  });

  it('leaves quotes intact (element text context)', () => {
    expect(escapeHtml('say "hi" & \'bye\'')).toBe('say "hi" &amp; \'bye\'');
  });

  it('passes plain text through unchanged', () => {
    expect(escapeHtml('nginx-1')).toBe('nginx-1');
  });
});

describe('escapeAttr', () => {
  it('escapes &, ", < and >', () => {
    expect(escapeAttr('a "b" <c> & d')).toBe('a &quot;b&quot; &lt;c&gt; &amp; d');
  });

  it('escapes ampersands before quotes without double-escaping', () => {
    expect(escapeAttr('&quot;')).toBe('&amp;quot;');
  });

  it('passes plain text through unchanged', () => {
    expect(escapeAttr('nginx-1')).toBe('nginx-1');
  });
});

describe('optionAccessibleName', () => {
  it('reads state, health and pin, not just the label', () => {
    expect(optionAccessibleName({ label: 'web', group: 'Running', badge: '5 minutes', health: 'unhealthy' }, true))
      .toBe('web, running, 5 minutes, health unhealthy, pinned for comparison');
    expect(optionAccessibleName({ label: 'nginx:latest' })).toBe('nginx:latest');
  });
});

describe('rovingTabIndex', () => {
  it('wraps with arrows and jumps with Home/End', () => {
    expect(rovingTabIndex('ArrowRight', 4, 5)).toBe(0);
    expect(rovingTabIndex('ArrowLeft', 0, 5)).toBe(4);
    expect(rovingTabIndex('Home', 3, 5)).toBe(0);
    expect(rovingTabIndex('End', 1, 5)).toBe(4);
    expect(rovingTabIndex('j', 1, 5)).toBeNull();
  });
});

describe('buildStatusHints', () => {
  it('lists actions, then the current container view and sort in words', () => {
    expect(buildStatusHints({ actions: [{ key: 's', label: 'Start' }], panelId: 'containers', showAllContainers: false, sortLabel: 'Name', sortDirection: 'A→Z' }))
      .toBe('s:Start  a:Running  \u2195Name \u00B7 A→Z');
    expect(buildStatusHints({ actions: [], panelId: 'images', showAllContainers: true, sortLabel: 'State', sortDirection: 'running first' })).toBe('');
  });
});

