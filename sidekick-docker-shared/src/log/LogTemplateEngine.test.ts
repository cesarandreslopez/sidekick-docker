import { describe, it, expect } from 'vitest';
import { LogTemplateEngine } from './LogTemplateEngine';

describe('LogTemplateEngine', () => {
  it('groups similar log lines into templates', () => {
    const engine = new LogTemplateEngine();
    engine.push('User alice logged in from 192.168.1.1');
    engine.push('User bob logged in from 10.0.0.1');
    engine.push('User charlie logged in from 172.16.0.1');

    const templates = engine.getTemplates();
    expect(templates.length).toBe(1);
    expect(templates[0].count).toBe(3);
    expect(templates[0].pattern).toContain('<*>');
  });

  it('keeps distinct patterns separate', () => {
    const engine = new LogTemplateEngine();
    engine.push('User logged in');
    engine.push('Server started on port 8080');
    engine.push('Server started on port 3000');

    const templates = engine.getTemplates();
    // "User logged in" has 3 tokens, "Server started on port XXXX" has 5 tokens
    // They should be in different groups
    expect(templates.length).toBeGreaterThanOrEqual(2);
  });

  it('sorts templates by frequency', () => {
    const engine = new LogTemplateEngine();
    for (let i = 0; i < 5; i++) engine.push('common log line here');
    engine.push('a totally different message');

    const templates = engine.getTemplates();
    expect(templates[0].count).toBeGreaterThan(templates[templates.length - 1].count);
  });

  it('respects limit parameter', () => {
    const engine = new LogTemplateEngine();
    for (let i = 0; i < 30; i++) {
      engine.push(`unique line number ${i} with different token count ${i}`);
    }

    const templates = engine.getTemplates(5);
    expect(templates.length).toBeLessThanOrEqual(5);
  });

  it('replaces variable-looking tokens with wildcards', () => {
    const engine = new LogTemplateEngine();
    engine.push('request 550e8400-e29b-41d4-a716 from 192.168.1.1');

    const templates = engine.getTemplates();
    expect(templates[0].pattern).toContain('<*>');
  });

  it('tracks total lines', () => {
    const engine = new LogTemplateEngine();
    engine.push('line 1');
    engine.push('line 2');
    engine.push('line 3');
    expect(engine.getTotalLines()).toBe(3);
  });

  it('resets state', () => {
    const engine = new LogTemplateEngine();
    engine.push('some log');
    engine.reset();
    expect(engine.getTemplates().length).toBe(0);
    expect(engine.getTotalLines()).toBe(0);
  });
});
