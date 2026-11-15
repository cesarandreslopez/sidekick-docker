import { describe, it, expect } from 'vitest';
import type { Key } from 'ink';
import type { ComposeClient, DockerClient } from 'sidekick-docker-shared';
import { GLOBAL_BINDINGS } from './keyRegistry';
import { ContainersPanel } from '../panels/ContainersPanel';
import { ServicesPanel } from '../panels/ServicesPanel';
import { ImagesPanel } from '../panels/ImagesPanel';
import { VolumesPanel } from '../panels/VolumesPanel';
import { NetworksPanel } from '../panels/NetworksPanel';
import type { SidePanel } from '../panels/types';

// Lives in ink/ rather than panels/: the import DAG forbids panels → ink.

const bareKey = {
  upArrow: false, downArrow: false, leftArrow: false, rightArrow: false,
  pageDown: false, pageUp: false, return: false, escape: false,
  ctrl: false, shift: false, tab: false, backspace: false, delete: false, meta: false,
} as Key;

// Constructors only store their dependencies, and getActions() never calls
// them, so empty stand-ins are enough to read the real action keys.
const panels: SidePanel[] = [
  new ContainersPanel({} as DockerClient, () => {}),
  new ServicesPanel({} as ComposeClient, () => {}),
  new ImagesPanel({} as DockerClient, () => {}),
  new VolumesPanel({} as DockerClient, () => {}),
  new NetworksPanel({} as DockerClient, () => {}),
];

describe('panel action keys vs global bindings', () => {
  // Global bindings are matched first: a panel action whose key a global
  // also matches can never run from the keyboard. A hardcoded key list let a
  // newly added action be shadowed without any test failing.
  for (const panel of panels) {
    it(`${panel.title}: no action key is shadowed by a global binding`, () => {
      for (const action of panel.getActions()) {
        const shadow = GLOBAL_BINDINGS.find(b => b.match(action.key, bareKey));
        expect(shadow?.id, `${panel.title} "${action.label}" (${action.key})`).toBeUndefined();
      }
    });

    it(`${panel.title}: action keys are unique`, () => {
      const keys = panel.getActions().map(a => a.key);
      expect(new Set(keys).size, keys.join(' ')).toBe(keys.length);
    });
  }

  it('reads a non-empty inventory from every panel', () => {
    for (const panel of panels) expect(panel.getActions().length, panel.title).toBeGreaterThan(0);
  });
});
