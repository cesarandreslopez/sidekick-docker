import * as vscode from 'vscode';
import type { ContainerInfo } from 'sidekick-docker-shared';
import { buildContainerGroups } from './containerGroups';
import type { ContainerGroup, ComposeProjectGroup } from './containerGroups';

type TreeElement = ContainerGroupItem | ComposeProjectGroupItem | ContainerTreeItem;

export class ContainerGroupItem extends vscode.TreeItem {
  readonly group: ContainerGroup;

  constructor(group: ContainerGroup, collapsibleState: vscode.TreeItemCollapsibleState) {
    super(group.label, collapsibleState);
    this.group = group;
    // Stable id + count in description so VS Code preserves expansion across refreshes.
    this.id = group.id;
    this.description = String(group.count);
    this.contextValue = 'container-group';
  }
}

export class ComposeProjectGroupItem extends vscode.TreeItem {
  readonly project: ComposeProjectGroup;

  constructor(project: ComposeProjectGroup) {
    super(project.projectName, vscode.TreeItemCollapsibleState.Collapsed);
    this.project = project;
    this.id = project.id;
    this.description = String(project.containers.length);
    this.iconPath = new vscode.ThemeIcon('layers');
    this.contextValue = 'compose-project-group';
  }
}

export class ContainerTreeItem extends vscode.TreeItem {
  readonly container: ContainerInfo;

  constructor(container: ContainerInfo) {
    super(container.name, vscode.TreeItemCollapsibleState.None);
    this.container = container;
    this.id = container.id;
    this.description = container.image;
    this.contextValue = `container-${container.state}`;
    this.tooltip = `${container.name}\n${container.image}\n${container.state} - ${container.status}`;

    // State-specific icon
    switch (container.state) {
      case 'running':
        this.iconPath = new vscode.ThemeIcon('debug-start', new vscode.ThemeColor('testing.iconPassed'));
        break;
      case 'paused':
        this.iconPath = new vscode.ThemeIcon('debug-pause', new vscode.ThemeColor('editorWarning.foreground'));
        break;
      case 'exited':
        this.iconPath = new vscode.ThemeIcon('debug-stop', new vscode.ThemeColor('errorForeground'));
        break;
      case 'restarting':
        this.iconPath = new vscode.ThemeIcon('sync', new vscode.ThemeColor('editorInfo.foreground'));
        break;
      case 'dead':
        this.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
        break;
      default:
        this.iconPath = new vscode.ThemeIcon('circle-outline');
        break;
    }
  }
}

export class ContainerTreeProvider implements vscode.TreeDataProvider<TreeElement> {
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeElement | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private containers: ContainerInfo[] = [];
  private connected = true;

  update(containers: ContainerInfo[], connected: boolean): void {
    this.containers = containers;
    this.connected = connected;
    // Drives the daemon-down viewsWelcome entry.
    void vscode.commands.executeCommand('setContext', 'sidekickDocker.daemonDown', !connected);
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeElement): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeElement): TreeElement[] {
    if (element) {
      if (element instanceof ContainerGroupItem) {
        return [
          ...element.group.composeProjects.map(p => new ComposeProjectGroupItem(p)),
          ...element.group.containers.map(c => new ContainerTreeItem(c)),
        ];
      }
      if (element instanceof ComposeProjectGroupItem) {
        return element.project.containers.map(c => new ContainerTreeItem(c));
      }
      return [];
    }

    // Root level — empty when disconnected or no containers, so the
    // viewsWelcome entries become reachable.
    if (!this.connected || this.containers.length === 0) {
      return [];
    }

    return buildContainerGroups(this.containers).map(group => new ContainerGroupItem(
      group,
      group.id === 'group-running'
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.Collapsed,
    ));
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}
