import { describe, it, expect } from 'vitest';
import { tokenizeLogLine } from './LogTokenizer';

describe('LogTokenizer', () => {
  it('returns a single plain token for a simple message', () => {
    const tokens = tokenizeLogLine('hello world');
    expect(tokens).toEqual([{ text: 'hello world', type: 'plain' }]);
  });

  it('detects severity keywords', () => {
    const tokens = tokenizeLogLine('this is an ERROR in the system');
    const errorToken = tokens.find(t => t.type === 'severity-error');
    expect(errorToken).toBeDefined();
    expect(errorToken!.text).toBe('ERROR');
  });

  it('detects WARN severity', () => {
    const tokens = tokenizeLogLine('WARNING: disk space low');
    const warnToken = tokens.find(t => t.type === 'severity-warn');
    expect(warnToken).toBeDefined();
  });

  it('detects INFO severity', () => {
    const tokens = tokenizeLogLine('[INFO] server started');
    const infoToken = tokens.find(t => t.type === 'severity-info');
    expect(infoToken).toBeDefined();
  });

  it('detects DEBUG severity', () => {
    const tokens = tokenizeLogLine('DEBUG processing request');
    const debugToken = tokens.find(t => t.type === 'severity-debug');
    expect(debugToken).toBeDefined();
  });

  it('detects HTTP methods', () => {
    const tokens = tokenizeLogLine('GET /api/users HTTP/1.1');
    const methodToken = tokens.find(t => t.type === 'http-method-safe');
    expect(methodToken).toBeDefined();
    expect(methodToken!.text).toBe('GET');
  });

  it('classifies unsafe HTTP methods', () => {
    const tokens = tokenizeLogLine('POST /api/users');
    const methodToken = tokens.find(t => t.type === 'http-method-unsafe');
    expect(methodToken).toBeDefined();
    expect(methodToken!.text).toBe('POST');
  });

  it('detects HTTP status codes', () => {
    const tokens = tokenizeLogLine('responded with 200 OK');
    const statusToken = tokens.find(t => t.type === 'http-status-2xx');
    expect(statusToken).toBeDefined();

    const tokens4 = tokenizeLogLine('error 404 not found');
    const status4Token = tokens4.find(t => t.type === 'http-status-4xx');
    expect(status4Token).toBeDefined();

    const tokens5 = tokenizeLogLine('server error 500');
    const status5Token = tokens5.find(t => t.type === 'http-status-5xx');
    expect(status5Token).toBeDefined();
  });

  it('detects URLs', () => {
    const tokens = tokenizeLogLine('connecting to https://api.example.com/v1');
    const urlToken = tokens.find(t => t.type === 'url');
    expect(urlToken).toBeDefined();
    expect(urlToken!.text).toBe('https://api.example.com/v1');
  });

  it('detects IP addresses', () => {
    const tokens = tokenizeLogLine('request from 192.168.1.100');
    const ipToken = tokens.find(t => t.type === 'ip-address');
    expect(ipToken).toBeDefined();
    expect(ipToken!.text).toBe('192.168.1.100');
  });

  it('detects ISO timestamps', () => {
    const tokens = tokenizeLogLine('2024-01-15T10:30:00Z event occurred');
    const tsToken = tokens.find(t => t.type === 'timestamp');
    expect(tsToken).toBeDefined();
  });

  it('detects JSON keys', () => {
    const tokens = tokenizeLogLine('"level": "info", "message": "started"');
    const keyTokens = tokens.filter(t => t.type === 'json-key');
    expect(keyTokens.length).toBe(2);
  });

  it('detects state keywords', () => {
    const tokens = tokenizeLogLine('service healthy and ready');
    const okTokens = tokens.filter(t => t.type === 'state-ok');
    expect(okTokens.length).toBeGreaterThanOrEqual(1);
  });

  it('detects failure state keywords', () => {
    const tokens = tokenizeLogLine('connection failed timeout');
    const failTokens = tokens.filter(t => t.type === 'state-fail');
    expect(failTokens.length).toBeGreaterThanOrEqual(1);
  });

  it('handles empty string', () => {
    const tokens = tokenizeLogLine('');
    expect(tokens).toEqual([{ text: '', type: 'plain' }]);
  });

  it('preserves all text (no gaps)', () => {
    const line = 'GET /api 200 from 10.0.0.1 ERROR connection failed';
    const tokens = tokenizeLogLine(line);
    const reconstructed = tokens.map(t => t.text).join('');
    expect(reconstructed).toBe(line);
  });
});
