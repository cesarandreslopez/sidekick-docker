import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { escapeHtml, escapeAttr, optionAccessibleName, rovingTabIndex, buildStatusHints, colorizeLogEntry } from './formatters';

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
    expect(optionAccessibleName({ label: 'registry.example.com/team/api', labelTail: ':1.2.3' })).toBe('registry.example.com/team/api:1.2.3');
  });

  it('reads the row\'s own state over its group, without repeating a badge that says the same', () => {
    // A paused container is grouped under Running; its name must still say paused.
    expect(optionAccessibleName({ label: 'cache', group: 'Running', badge: 'paused', stateText: 'paused' })).toBe('cache, paused');
    expect(optionAccessibleName({ label: 'data', badge: 'local', stateText: 'in use' })).toBe('data, in use, local');
  });
});

describe('sortToast', () => {
  it('names the sort by its menu label and direction', async () => {
    const { sortToast } = await import('./keyboard');
    expect(sortToast('cpu', false)).toMatch(/^Sort: CPU %, /);
    expect(sortToast('name', true)).toMatch(/^Sort: Name, /);
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
      .toBe('s:Start  a:Running  o:\u2195Name \u00B7 A→Z');
    expect(buildStatusHints({ actions: [], panelId: 'images', showAllContainers: true, sortLabel: 'State', sortDirection: 'running first' })).toBe('');
  });
});


describe('colorizeLogEntry', () => {
  /** The flex children of the rendered .log-line, and any loose text between them. */
  function lineParts(html: string) {
    const line = new JSDOM(html).window.document.body.firstElementChild!;
    const looseText = [...line.childNodes].filter(n => n.nodeType === 3 && n.textContent!.trim() !== '');
    return { line, children: [...line.children], looseText };
  }

  it('keeps the whole message in one element on every path, so flex layout keeps its spaces', () => {
    const message = 'ERROR 500 GET /api/orders took 12ms';
    const cases = [
      colorizeLogEntry({ timestamp: '2026-01-01T10:00:00Z', stream: 'stdout', message }),
      colorizeLogEntry({ timestamp: null, stream: 'stdout', message }),
      colorizeLogEntry({ timestamp: null, stream: 'stderr', message }),
      colorizeLogEntry({ timestamp: null, stream: 'stdout', message }, [{ start: 0, length: 5 }, { start: 10, length: 3 }]),
      colorizeLogEntry({ timestamp: null, stream: 'stderr', message }, [{ start: 6, length: 3 }]),
    ];
    for (const html of cases) {
      const { line, children, looseText } = lineParts(html);
      expect(line.className).toBe('log-line');
      const msg = children.filter(c => c.classList.contains('log-msg'));
      expect(msg).toHaveLength(1);
      expect(msg[0].textContent).toBe(message);
      expect(children.every(c => c.classList.contains('log-msg') || c.classList.contains('log-timestamp'))).toBe(true);
      expect(looseText).toEqual([]);
    }
  });

  it('escapes the message and highlights filter matches inside the message element', () => {
    const { children } = lineParts(colorizeLogEntry({ timestamp: null, stream: 'stdout', message: '<b>boom</b> here' }, [{ start: 3, length: 4 }]));
    const msg = children[0];
    expect(msg.querySelector('b')).toBeNull();
    expect(msg.querySelector('mark.log-match')?.textContent).toBe('boom');
  });
});
