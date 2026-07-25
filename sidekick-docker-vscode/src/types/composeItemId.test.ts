import { describe, it, expect } from 'vitest';
import {
  parseComposeItemId,
  composeProjectId,
  composeServiceId,
  composeProjectNameOf,
} from './composeItemId';

describe('compose item ids', () => {
  it('round-trips a project', () => {
    expect(parseComposeItemId(composeProjectId('api'))).toEqual({ kind: 'project', projectName: 'api' });
  });

  it('round-trips a service', () => {
    expect(parseComposeItemId(composeServiceId('api', 'web'))).toEqual({
      kind: 'service', projectName: 'api', serviceName: 'web',
    });
  });

  it('keeps colons in a project name', () => {
    // The reason this is worth centralizing: indexing parts[1] instead of
    // rejoining silently truncates a project named "a:b".
    expect(parseComposeItemId('project:a:b')).toEqual({ kind: 'project', projectName: 'a:b' });
  });

  it('keeps colons in a service name', () => {
    expect(parseComposeItemId('service:api:web:1')).toEqual({
      kind: 'service', projectName: 'api', serviceName: 'web:1',
    });
  });

  it('reports anything else as unknown rather than guessing', () => {
    expect(parseComposeItemId('no-services')).toEqual({ kind: 'unknown' });
    expect(parseComposeItemId('')).toEqual({ kind: 'unknown' });
  });

  it('resolves the owning project for either row kind', () => {
    expect(composeProjectNameOf(composeProjectId('api'))).toBe('api');
    expect(composeProjectNameOf(composeServiceId('api', 'web'))).toBe('api');
    expect(composeProjectNameOf('no-services')).toBeNull();
  });
});
