// Load the packaged extension with only Node built-ins and a minimal VS Code API.
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { isBuiltin } = require('node:module');
const file = process.argv[2];
const disposable = () => ({ dispose() {} });
let ready;
const connected = new Promise(resolve => { ready = resolve; });
const vscode = {
  TreeItem: class {},
  EventEmitter: class { event = disposable; fire() {} dispose() {} },
  ThemeColor: class {}, ThemeIcon: class {},
  StatusBarAlignment: { Right: 2 }, ProgressLocation: { Notification: 15 },
  workspace: { isTrusted: true, workspaceFolders: undefined, getConfiguration: () => ({ get: (_key, fallback) => fallback }), onDidChangeConfiguration: disposable, onDidChangeWorkspaceFolders: disposable },
  window: {
    createTreeView: disposable,
    createStatusBarItem: () => ({
      show() {}, hide() {}, dispose() {},
      set text(value) { if (value === '$(package) 1/1') ready(); },
    }),
    registerWebviewPanelSerializer: disposable,
    showWarningMessage: console.error,
  },
  commands: { registerCommand: disposable, executeCommand: async () => {} },
};
const mod = { exports: {} };
vm.runInThisContext(`(function(require,module,exports,__filename,__dirname){${fs.readFileSync(file, 'utf8')}\n})`, { filename: file })(
  id => {
    if (id === 'vscode') return vscode;
    if (!isBuiltin(id)) throw new Error(`Packaged extension requested an external dependency: ${id}`);
    return require(id);
  }, mod, mod.exports, file, path.dirname(file),
);
const subscriptions = [];
const timeout = setTimeout(() => { console.error('Extension did not load containers over SSH'); process.exit(1); }, 15000);
mod.exports.activate({ subscriptions, extensionUri: {} });
connected.then(() => {
  mod.exports.deactivate();
  for (const sub of subscriptions) sub.dispose();
  clearTimeout(timeout);
  console.log('Packaged extension loaded containers over SSH');
  process.exit(0);
}).catch(error => { console.error(error); process.exit(1); });
