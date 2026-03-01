import { describe, it, expect } from 'vitest';
import { detectFormat, parseLine } from './LogParser';

describe('detectFormat', () => {
  it('detects JSON format', () => {
    expect(detectFormat('{"level":"info","msg":"started"}')).toBe('json');
  });

  it('detects logfmt format', () => {
    expect(detectFormat('level=info msg="server started" port=8080')).toBe('logfmt');
  });

  it('detects plain text', () => {
    expect(detectFormat('just a regular log line')).toBe('plain');
  });
});

describe('parseLine', () => {
  it('parses JSON log lines', () => {
    const result = parseLine('{"level":"error","msg":"connection failed","host":"db.local"}');
    expect(result.format).toBe('json');
    expect(result.level).toBe('error');
    expect(result.message).toBe('connection failed');
    expect(result.fields.host).toBe('db.local');
  });

  it('handles JSON with different level keys', () => {
    expect(parseLine('{"severity":"WARNING","message":"slow query"}').level).toBe('warn');
    expect(parseLine('{"lvl":"debug","msg":"trace"}').level).toBe('debug');
  });

  it('extracts timestamp from JSON', () => {
    const result = parseLine('{"time":"2024-01-15T10:30:00Z","msg":"event"}');
    expect(result.timestamp).toBe('2024-01-15T10:30:00Z');
  });

  it('parses logfmt lines', () => {
    const result = parseLine('level=info msg="request handled" duration=150ms');
    expect(result.format).toBe('logfmt');
    expect(result.level).toBe('info');
    expect(result.message).toBe('request handled');
    expect(result.fields.duration).toBe('150ms');
  });

  it('falls back to plain text', () => {
    const result = parseLine('ERROR: something went wrong');
    expect(result.format).toBe('plain');
    expect(result.level).toBe('error');
    expect(result.message).toBe('ERROR: something went wrong');
  });

  it('detects no level in plain text without keywords', () => {
    const result = parseLine('just a line of text');
    expect(result.format).toBe('plain');
    expect(result.level).toBeNull();
  });

  it('handles malformed JSON gracefully', () => {
    const result = parseLine('{not valid json}');
    expect(result.format).not.toBe('json');
  });
});
