import { describe, expect, it } from 'vitest';
import { escapeHtml, escapeAttr } from './formatters';

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
