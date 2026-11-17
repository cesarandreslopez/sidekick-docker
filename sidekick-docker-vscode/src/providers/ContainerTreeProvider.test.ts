import { beforeEach, describe, expect, it } from 'vitest';
import type { ContainerInfo } from 'sidekick-docker-shared';
import { ComposeProjectGroupItem, ContainerGroupItem, ContainerTreeItem, containerIdFromArg, openOptionsFromArg } from './ContainerTreeProvider';
import { __mock, TreeItemCollapsibleState, workspace } from '../test/vscode';

function makeContainer(overrides: Partial<ContainerInfo> & { id: string }): ContainerInfo {
  return { name: overrides.id, image: 'nginx:latest', state: 'running', status: 'Up', ports: [], created: new Date(0), ...overrides };
}

describe('tree command arguments', () => {
  beforeEach(() => __mock.reset());

  it('only resolves a container from a container row (or an id), never from a group header', () => {
    const row = new ContainerTreeItem(makeContainer({ id: 'abc' }));
    const group = new ContainerGroupItem({ id: 'group-running', label: 'Running', count: 1, composeProjects: [], containers: [] }, TreeItemCollapsibleState.Expanded);
    const project = new ComposeProjectGroupItem({ id: 'group-running/proj:shop', projectName: 'shop', containers: [], live: false });
    expect(containerIdFromArg(row)).toBe('abc');
    expect(containerIdFromArg('def')).toBe('def');
    expect(containerIdFromArg(group)).toBeUndefined();
    expect(containerIdFromArg(project)).toBeUndefined();
    expect(containerIdFromArg(undefined)).toBeUndefined();
    expect(containerIdFromArg('')).toBeUndefined();
  });

  it('keeps focus in the tree only for a row click, not for menus (which pass the selection)', () => {
    const row = new ContainerTreeItem(makeContainer({ id: 'abc' }));
    expect(row.command?.arguments?.[0]).toBe(row);
    expect(openOptionsFromArg(row.command?.arguments?.[1])).toEqual({ preserveFocus: true });
    expect(openOptionsFromArg([row])).toEqual({});
    expect(openOptionsFromArg(undefined)).toEqual({});
  });
});

describe('ComposeProjectGroupItem', () => {
  beforeEach(() => __mock.reset());

  it('offers Down for an all-paused project and says what its menu offers', () => {
    const item = new ComposeProjectGroupItem({ id: 'g/p', projectName: 'shop', containers: [makeContainer({ id: 'a', state: 'paused' })], live: true });
    expect(item.contextValue).toBe('compose-project-group-running');
    expect(item.tooltip).toBe('Compose project shop — right-click for Up, Down, Restart');
  });

  it('says compose is disabled in an untrusted workspace', () => {
    workspace.isTrusted = false;
    const item = new ComposeProjectGroupItem({ id: 'g/p', projectName: 'shop', containers: [makeContainer({ id: 'a' })], live: true });
    expect(item.tooltip).toMatch(/disabled until this workspace is trusted/);
  });
});
