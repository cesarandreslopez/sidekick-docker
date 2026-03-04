import * as vscode from 'vscode';
import type { ContainerInfo } from 'sidekick-docker-shared';

type TreeElement = ContainerGroupItem | ContainerTreeItem;

export class ContainerGroupItem extends vscode.TreeItem {
  readonly containers: ContainerInfo[];

  constructor(
    label: string,
    count: number,
    collapsibleState: vscode.TreeItemCollapsibleState,
    containers: ContainerInfo[],
  ) {
    super(`${label} (${count})`, collapsibleState);
    this.containers = containers;
    this.contextValue = 'container-group';
  }
}

export class ContainerTreeItem extends vscode.TreeItem {
  readonly container: ContainerInfo;

  constructor(container: ContainerInfo) {
    super(container.name, vscode.TreeItemCollapsibleState.None);
    this.container = container;
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

    this.command = {
      command: 'sidekick-docker.openContainerInDashboard',
      title: 'Open in Dashboard',
      arguments: [container.id],
    };
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
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeElement): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeElement): TreeElement[] {
    if (element) {
      // Children of a group
      if (element instanceof ContainerGroupItem) {
        return element.containers.map(c => new ContainerTreeItem(c));
      }
      return [];
    }

    // Root level
    if (!this.connected) {
      const item = new vscode.TreeItem('Docker daemon not running');
      item.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('editorWarning.foreground'));
      item.contextValue = 'warning';
      return [item as TreeElement];
    }

    if (this.containers.length === 0) {
      const item = new vscode.TreeItem('No containers');
      item.iconPath = new vscode.ThemeIcon('info');
      item.contextValue = 'info';
      return [item as TreeElement];
    }

    const running = this.containers.filter(c => c.state === 'running');
    const stopped = this.containers.filter(c => c.state === 'exited');
    const other = this.containers.filter(c => c.state !== 'running' && c.state !== 'exited');

    const groups: TreeElement[] = [];

    if (running.length > 0) {
      groups.push(new ContainerGroupItem(
        'Running',
        running.length,
        vscode.TreeItemCollapsibleState.Expanded,
        running,
      ));
    }
    if (stopped.length > 0) {
      groups.push(new ContainerGroupItem(
        'Stopped',
        stopped.length,
        vscode.TreeItemCollapsibleState.Collapsed,
        stopped,
      ));
    }
    if (other.length > 0) {
      groups.push(new ContainerGroupItem(
        'Other',
        other.length,
        vscode.TreeItemCollapsibleState.Collapsed,
        other,
      ));
    }

    return groups;
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}
