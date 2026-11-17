import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface Manifest {
  activationEvents: string[];
  contributes: {
    configuration: { properties: Record<string, { scope?: string }> };
    viewsWelcome: { when: string; contents: string }[];
  };
  capabilities: { untrustedWorkspaces: { restrictedConfigurations: string[] } };
}

const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as Manifest;

describe('extension manifest', () => {
  it('lets the endpoint and exec shell be set per machine (Remote settings), still restricted until trusted', () => {
    const props = manifest.contributes.configuration.properties;
    for (const key of ['sidekick-docker.socketPath', 'sidekick-docker.exec.defaultShell']) {
      expect(props[key].scope, key).toBe('machine-overridable');
      expect(manifest.capabilities.untrustedWorkspaces.restrictedConfigurations).toContain(key);
    }
  });

  it('activates to revive a dashboard left open across a reload', () => {
    expect(manifest.activationEvents).toContain('onWebviewPanel:sidekick-docker.dashboard');
  });

  it('links the endpoint setting from the daemon-down welcome view', () => {
    const down = manifest.contributes.viewsWelcome.find(v => v.when.startsWith('sidekickDocker.daemonDown'));
    const link = /\(command:workbench\.action\.openSettings\?([^)]+)\)/.exec(down?.contents ?? '');
    expect(link).not.toBeNull();
    expect(JSON.parse(decodeURIComponent(link![1]))).toEqual(['sidekick-docker.socketPath']);
  });
});
