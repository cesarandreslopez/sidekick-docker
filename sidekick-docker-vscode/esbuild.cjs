const esbuild = require('esbuild');
const pkg = require('./package.json');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** Stub optional native deps that dockerode's transport (docker-modem) tries to require. */
const stubNativeOptionals = {
  name: 'stub-native-optionals',
  setup(b) {
    for (const mod of ['ssh2', 'cpu-features']) {
      b.onResolve({ filter: new RegExp(`^${mod}$`) }, () => ({
        path: mod,
        namespace: 'stub-native',
      }));
    }
    b.onLoad({ filter: /.*/, namespace: 'stub-native' }, (args) => ({
      contents: args.path === 'ssh2'
        ? 'module.exports = { Client: class Client { connect() {} on() { return this; } end() {} } };'
        : 'module.exports = {};',
    }));
  },
};

async function main() {
  // Extension host — Node.js CJS bundle
  const extensionCtx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: 'out/extension.js',
    external: ['vscode'],
    plugins: [stubNativeOptionals],
    logLevel: 'warning',
  });

  // Webview — browser IIFE bundle
  const webviewCtx = await esbuild.context({
    entryPoints: ['src/webview/dashboard.ts'],
    bundle: true,
    format: 'iife',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'browser',
    target: ['es2020'],
    outfile: 'out/webview/dashboard.js',
    define: { '__VERSION__': JSON.stringify(pkg.version) },
    logLevel: 'warning',
  });

  if (watch) {
    await Promise.all([extensionCtx.watch(), webviewCtx.watch()]);
    console.log('Watching for changes...');
  } else {
    await Promise.all([extensionCtx.rebuild(), webviewCtx.rebuild()]);
    await Promise.all([extensionCtx.dispose(), webviewCtx.dispose()]);
  }
}

main().catch(() => process.exit(1));
