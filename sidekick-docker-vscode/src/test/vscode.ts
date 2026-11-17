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
  location: ProgressLocation | { viewId: string };
  title: string | undefined;
  cancellable: boolean;
}

/** A line written to a mock output channel, with the level it was logged at. */
export interface MockOutputLine {
  channel: string;
  level: 'info' | 'warn' | 'error' | 'append';
  text: string;
}

type Listener = () => void;

export const __mock = {
  /** Values returned by workspace.getConfiguration().get(), keyed by "<section>.<key>". */
  configValues: new Map<string, unknown>(),
  warningMessages: [] as string[],
  errorMessages: [] as string[],
  infoMessages: [] as string[],
  /** The buttons offered with each warning/error/info message, in call order. */
  messageItems: [] as string[][],
  /** What the next show{Warning,Error,Information}Message resolves to (undefined = dismissed). */
  messageChoice: undefined as string | undefined,
  progressCalls: [] as MockProgressCall[],
  /** Cancellation listeners of the progress tasks still running. */
  progressCancel: [] as Listener[],
  /** URIs passed to env.openExternal. */
  openedExternal: [] as string[],
  /** What window.showQuickPick resolves to next (undefined = dismissed). */
  quickPickResult: undefined as string | undefined,
  /** Text written through env.clipboard.writeText. */
  clipboard: [] as string[],
  /** commands.executeCommand calls: [id, ...args]. */
  executedCommands: [] as unknown[][],
  outputLines: [] as MockOutputLine[],
  /** Names of output channels whose show() was called. */
  shownChannels: [] as string[],
  statusBarMessages: [] as string[],
  /** Press "Cancel" on every running cancellable progress notification. */
  cancelProgress(): void {
    for (const listener of [...this.progressCancel]) listener();
  },
  reset(): void {
    this.configValues.clear();
    this.warningMessages.length = 0;
    this.errorMessages.length = 0;
    this.infoMessages.length = 0;
    this.messageItems.length = 0;
    this.messageChoice = undefined;
    this.progressCalls.length = 0;
    this.progressCancel.length = 0;
    this.openedExternal.length = 0;
    this.quickPickResult = undefined;
    this.clipboard.length = 0;
    this.executedCommands.length = 0;
    this.outputLines.length = 0;
    this.shownChannels.length = 0;
    this.statusBarMessages.length = 0;
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

/** The message items a call passed, skipping a leading options object ({ modal: true }). */
function itemsOf(rest: unknown[]): string[] {
  return rest.filter((r): r is string => typeof r === 'string');
}

function message(list: string[], text: string, rest: unknown[]): Promise<string | undefined> {
  list.push(text);
  const items = itemsOf(rest);
  __mock.messageItems.push(items);
  const choice = __mock.messageChoice;
  return Promise.resolve(choice !== undefined && items.includes(choice) ? choice : undefined);
}

export const window = {
  showQuickPick(): Promise<string | undefined> {
    return Promise.resolve(__mock.quickPickResult ?? undefined);
  },
  showWarningMessage(text: string, ...rest: unknown[]): Promise<string | undefined> {
    return message(__mock.warningMessages, text, rest);
  },
  showErrorMessage(text: string, ...rest: unknown[]): Promise<string | undefined> {
    return message(__mock.errorMessages, text, rest);
  },
  showInformationMessage(text: string, ...rest: unknown[]): Promise<string | undefined> {
    return message(__mock.infoMessages, text, rest);
  },
  setStatusBarMessage(text: string): { dispose(): void } {
    __mock.statusBarMessages.push(text);
    return { dispose() { /* noop */ } };
  },
  async withProgress<T>(
    options: { location: ProgressLocation | { viewId: string }; title?: string; cancellable?: boolean },
    task: (progress: { report(value: unknown): void }, token: { isCancellationRequested: boolean; onCancellationRequested(listener: Listener): { dispose(): void } }) => Promise<T> | T,
  ): Promise<T> {
    __mock.progressCalls.push({ location: options.location, title: options.title, cancellable: options.cancellable === true });
    const listeners: Listener[] = [];
    const token = {
      isCancellationRequested: false,
      onCancellationRequested(listener: Listener) {
        listeners.push(listener);
        return { dispose() { /* noop */ } };
      },
    };
    const cancel = (): void => {
      token.isCancellationRequested = true;
      for (const listener of listeners) listener();
    };
    if (options.cancellable) __mock.progressCancel.push(cancel);
    try {
      return await task({ report() { /* noop */ } }, token);
    } finally {
      const i = __mock.progressCancel.indexOf(cancel);
      if (i >= 0) __mock.progressCancel.splice(i, 1);
    }
  },
  createOutputChannel(name: string) {
    const write = (level: MockOutputLine['level']) => (text: string) => { __mock.outputLines.push({ channel: name, level, text }); };
    return {
      name,
      info: write('info'),
      warn: write('warn'),
      error: write('error'),
      append: write('append'),
      appendLine: write('append'),
      show() { __mock.shownChannels.push(name); },
      dispose() { /* noop */ },
    };
  },
};

export const commands = {
  executeCommand(id: string, ...args: unknown[]): Promise<undefined> {
    __mock.executedCommands.push([id, ...args]);
    return Promise.resolve(undefined);
  },
};

export const Uri = {
  parse(value: string): { toString(): string } {
    return { toString: () => value };
  },
  joinPath(base: { path?: string } | undefined, ...parts: string[]): { path: string; toString(): string } {
    const path = [base?.path ?? '', ...parts].join('/');
    return { path, toString: () => path };
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

export class EventEmitter<T> {
  private listeners: ((value: T) => void)[] = [];
  readonly event = (listener: (value: T) => void): { dispose(): void } => {
    this.listeners.push(listener);
    return { dispose: () => { this.listeners = this.listeners.filter(l => l !== listener); } };
  };
  fire(value: T): void { for (const l of this.listeners) l(value); }
  dispose(): void { this.listeners = []; }
}

export class MarkdownString {
  constructor(public value = '') {}
}
