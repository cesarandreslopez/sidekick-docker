import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { resolveComposeCwd, resolveComposeOptions } from './composeCwd';

describe('resolveComposeCwd', () => {
  const realDir = mkdtempSync(join(tmpdir(), 'sd-compose-'));
  const realFile = join(realDir, 'docker-compose.yml');
  writeFileSync(realFile, 'services: {}\n');

  it('prefers the project working dir over the caller fallback', () => {
    // The bug this guards: the CLI passed process.cwd() for every project, so
    // running from ~ ran compose in ~ rather than where the project lives.
    expect(resolveComposeCwd({ workingDir: realDir }, '/some/other/place')).toBe(realDir);
  });

  it('falls back to the config file directory when no working dir survived', () => {
    expect(resolveComposeCwd({ configFile: realFile }, '/some/other/place')).toBe(dirname(realFile));
  });

  it('ignores a working dir that no longer exists', () => {
    // A project can outlive the checkout it was created from.
    expect(resolveComposeCwd({ workingDir: '/definitely/not/here' }, realDir)).toBe(realDir);
  });

  it('ignores a config file that no longer exists', () => {
    expect(resolveComposeCwd({ configFile: '/definitely/not/here/compose.yml' }, realDir)).toBe(realDir);
  });

  it('returns the fallback when the project recorded nothing', () => {
    expect(resolveComposeCwd(undefined, realDir)).toBe(realDir);
    expect(resolveComposeCwd({}, realDir)).toBe(realDir);
  });

  it('returns undefined when there is no fallback either', () => {
    // Undefined means "let the spawned process use its own cwd".
    expect(resolveComposeCwd(undefined, undefined)).toBeUndefined();
  });

  it('prefers workingDir over configFile when both are live', () => {
    expect(resolveComposeCwd({ workingDir: realDir, configFile: realFile }, undefined)).toBe(realDir);
  });

  it('retains override ordering and resolves recorded relative paths', () => {
    const override = join(realDir, 'override.yml');
    writeFileSync(override, 'services: {}\n');
    expect(resolveComposeOptions({ workingDir: realDir, configFiles: ['docker-compose.yml', 'override.yml'] }, '/unrelated'))
      .toEqual({ cwd: realDir, configFiles: [realFile, override] });
  });

  it('refuses an action with missing recorded configuration instead of using another directory', () => {
    expect(() => resolveComposeOptions({ configFiles: ['/missing/compose.yml'] }, realDir)).toThrow('Compose configuration not found');
    expect(() => resolveComposeOptions({ workingDir: '/missing/checkout' }, realDir)).toThrow('Compose project directory not found');
  });

  process.on('exit', () => { rmSync(realDir, { recursive: true, force: true }); });
});
