import { describe, it, expect } from 'vitest';
import { formatBytes, formatCpu, formatPorts, stateIcon, truncate, stripCursorEscapes, colorizeEnvLine, colorizeBool, colorizeId, colorizePercent } from './formatters';

describe('formatters', () => {
  describe('formatBytes', () => {
    it('formats zero', () => expect(formatBytes(0)).toBe('0 B'));
    it('formats bytes', () => expect(formatBytes(500)).toBe('500 B'));
    it('formats kilobytes', () => expect(formatBytes(1536)).toBe('1.5 KB'));
    it('formats megabytes', () => expect(formatBytes(104857600)).toBe('100.0 MB'));
    it('formats gigabytes', () => expect(formatBytes(1073741824)).toBe('1.0 GB'));
  });

  describe('formatCpu', () => {
    it('formats percentage', () => expect(formatCpu(12.345)).toBe('12.3%'));
    it('formats zero', () => expect(formatCpu(0)).toBe('0.0%'));
  });

  describe('formatPorts', () => {
    it('formats port bindings', () => {
      expect(formatPorts([
        { hostIp: '0.0.0.0', hostPort: 8080, containerPort: 80, protocol: 'tcp' },
      ])).toBe('8080:80/tcp');
    });

    it('filters out zero host ports', () => {
      expect(formatPorts([
        { hostIp: '0.0.0.0', hostPort: 0, containerPort: 80, protocol: 'tcp' },
      ])).toBe('-');
    });

    it('joins multiple ports', () => {
      expect(formatPorts([
        { hostIp: '0.0.0.0', hostPort: 8080, containerPort: 80, protocol: 'tcp' },
        { hostIp: '0.0.0.0', hostPort: 3000, containerPort: 3000, protocol: 'tcp' },
      ])).toBe('8080:80/tcp, 3000:3000/tcp');
    });
  });

  describe('stateIcon', () => {
    it('returns icons for each state', () => {
      expect(stateIcon('running')).toBeTruthy();
      expect(stateIcon('exited')).toBeTruthy();
      expect(stateIcon('paused')).toBeTruthy();
    });
  });

  describe('truncate', () => {
    it('returns short strings as-is', () => {
      expect(truncate('hello', 10)).toBe('hello');
    });
    it('truncates long strings', () => {
      expect(truncate('hello world!', 8)).toHaveLength(8);
    });
  });

  describe('stripCursorEscapes', () => {
    it('strips cursor movement sequences', () => {
      expect(stripCursorEscapes('\x1b[A\x1b[2Bhello')).toBe('hello');
    });
    it('strips cursor positioning', () => {
      expect(stripCursorEscapes('\x1b[10;5Hhello')).toBe('hello');
    });
    it('strips screen clear', () => {
      expect(stripCursorEscapes('\x1b[2Jhello\x1b[K')).toBe('hello');
    });
    it('strips mode changes', () => {
      expect(stripCursorEscapes('\x1b[?25lhello\x1b[?25h')).toBe('hello');
    });
    it('preserves SGR color sequences', () => {
      expect(stripCursorEscapes('\x1b[32mhello\x1b[0m')).toBe('\x1b[32mhello\x1b[0m');
    });
    it('strips carriage returns', () => {
      expect(stripCursorEscapes('hello\r\nworld')).toBe('hello\nworld');
    });
    it('strips window title escapes', () => {
      expect(stripCursorEscapes('\x1b]0;my title\x07hello')).toBe('hello');
    });
    it('handles plain text unchanged', () => {
      expect(stripCursorEscapes('hello world')).toBe('hello world');
    });
  });

  describe('colorizeEnvLine', () => {
    it('colors key before equals sign', () => {
      const result = colorizeEnvLine('MY_VAR=hello');
      expect(result).toContain('\x1b[38;2;43;76;126m'); // brand
      expect(result).toContain('MY_VAR');
      expect(result).toContain('=hello');
    });
    it('returns line unchanged when no equals sign', () => {
      expect(colorizeEnvLine('no-equals')).toBe('no-equals');
    });
    it('handles empty value', () => {
      const result = colorizeEnvLine('KEY=');
      expect(result).toContain('KEY');
      expect(result.endsWith('=')).toBe(true);
    });
  });

  describe('colorizeBool', () => {
    it('colors true as green Yes', () => {
      const result = colorizeBool(true);
      expect(result).toContain('\x1b[32m'); // green
      expect(result).toContain('Yes');
    });
    it('colors false as dim gray No', () => {
      const result = colorizeBool(false);
      expect(result).toContain('\x1b[90m'); // gray
      expect(result).toContain('No');
    });
  });

  describe('colorizeId', () => {
    it('wraps id in dim gray', () => {
      const result = colorizeId('abc123def456');
      expect(result).toContain('\x1b[2m'); // dim
      expect(result).toContain('\x1b[90m'); // gray
      expect(result).toContain('abc123def456');
    });
  });

  describe('colorizePercent', () => {
    it('returns plain for values <= 50', () => {
      const result = colorizePercent(25);
      expect(result).toBe('25.0%');
    });
    it('returns yellow for values > 50', () => {
      const result = colorizePercent(65);
      expect(result).toContain('\x1b[33m'); // yellow
      expect(result).toContain('65.0%');
    });
    it('returns red for values > 80', () => {
      const result = colorizePercent(95);
      expect(result).toContain('\x1b[31m'); // red
      expect(result).toContain('95.0%');
    });
  });
});
