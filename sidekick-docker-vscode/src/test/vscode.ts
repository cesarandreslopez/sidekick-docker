/**
 * Minimal mock of the `vscode` module for vitest.
 * Wired in via the `vscode` resolve alias in vitest.config.ts, so any
 * module under test that does `import * as vscode from 'vscode'` receives
 * this module instance. Tests can import it directly to inspect/seed state
 * via `__mock`.
 */

export enum ProgressLocation {
  SourceControl = 1,
  Window = 10,
  Notification = 15,
}

export interface MockProgressCall {
  location: ProgressLocation;
  title: string | undefined;
}

export const __mock = {
  /** Values returned by workspace.getConfiguration().get(), keyed by "<section>.<key>". */
  configValues: new Map<string, unknown>(),
  warningMessages: [] as string[],
  progressCalls: [] as MockProgressCall[],
  /** URIs passed to env.openExternal. */
  openedExternal: [] as string[],
  /** What window.showQuickPick resolves to next (undefined = dismissed). */
  quickPickResult: undefined as string | undefined,
  /** Text written through env.clipboard.writeText. */
  clipboard: [] as string[],
  reset(): void {
    this.configValues.clear();
    this.warningMessages.length = 0;
    this.progressCalls.length = 0;
    this.openedExternal.length = 0;
    this.quickPickResult = undefined;
    this.clipboard.length = 0;
    workspace.isTrusted = true;
  },
};

export const workspace = {
  getConfiguration(section?: string) {
    return {
      get<T>(key: string, defaultValue: T): T {
        const fullKey = section ? `${section}.${key}` : key;
        return (__mock.configValues.has(fullKey) ? __mock.configValues.get(fullKey) : defaultValue) as T;
      },
    };
  },
  onDidChangeConfiguration(): { dispose(): void } {
    return { dispose() { /* noop */ } };
  },
  workspaceFolders: undefined as readonly { uri: { fsPath: string } }[] | undefined,
  /** Workspace trust; compose is gated on this (see utils/workspace.ts). */
  isTrusted: true,
  onDidChangeWorkspaceFolders(): { dispose(): void } {
    return { dispose() { /* noop */ } };
  },
};

export const window = {
  showQuickPick(): Promise<string | undefined> {
    return Promise.resolve(__mock.quickPickResult ?? undefined);
  },
  showWarningMessage(message: string): Promise<undefined> {
    __mock.warningMessages.push(message);
    return Promise.resolve(undefined);
  },
  async withProgress<T>(
    options: { location: ProgressLocation; title?: string },
    task: () => Promise<T> | T,
  ): Promise<T> {
    __mock.progressCalls.push({ location: options.location, title: options.title });
    return task();
  },
};

export const Uri = {
  parse(value: string): { toString(): string } {
    return { toString: () => value };
  },
};

export const env = {
  asExternalUri<T>(uri: T): Promise<T> {
    return Promise.resolve(uri);
  },
  openExternal(uri: { toString(): string }): Promise<boolean> {
    __mock.openedExternal.push(uri.toString());
    return Promise.resolve(true);
  },
  clipboard: {
    writeText(text: string): Promise<void> {
      __mock.clipboard.push(text);
      return Promise.resolve();
    },
  },
};

/* Tree items: just enough to construct the tree's item classes. */
export enum TreeItemCollapsibleState { None = 0, Collapsed = 1, Expanded = 2 }

export class TreeItem {
  id?: string;
  description?: string;
  contextValue?: string;
  tooltip?: unknown;
  iconPath?: unknown;
  command?: { command: string; title: string; arguments?: unknown[] };
  constructor(public label: string, public collapsibleState?: TreeItemCollapsibleState) {}
}

export class ThemeColor {
  constructor(public id: string) {}
}

export class ThemeIcon {
  constructor(public id: string, public color?: ThemeColor) {}
}

