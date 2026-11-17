import { describe, expect, it } from 'vitest';
import { refreshResultText, startupWarningText, unavailableText } from './resourceErrors';

describe('resource error wording (T10)', () => {
  it('names the kinds and why, each reason once', () => {
    expect(unavailableText({})).toBeNull();
    expect(unavailableText(undefined)).toBeNull();
    expect(unavailableText({ images: 'permission denied' })).toBe('images unavailable: permission denied');
    expect(unavailableText({ images: 'timed out', volumes: 'timed out', networks: 'EOF' })).toBe('images, volumes, networks unavailable: timed out; EOF');
  });

  it('words the Ctrl+R result', () => {
    expect(refreshResultText({})).toEqual({ text: 'Refreshed', severity: 'success' });
    expect(refreshResultText({ services: 'docker compose config failed' })).toEqual({
      text: 'Refreshed — services unavailable: docker compose config failed', severity: 'warning',
    });
  });

  it('words the startup warning', () => {
    expect(startupWarningText({})).toBeNull();
    expect(startupWarningText({ images: 'denied' })).toBe('Images unavailable: denied');
  });
});
