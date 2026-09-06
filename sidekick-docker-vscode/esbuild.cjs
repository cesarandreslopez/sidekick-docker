const esbuild = require('esbuild');
const pkg = require('./package.json');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

const nativeFallbacks = require('../scripts/native-fallbacks.cjs');

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
    plugins: [nativeFallbacks],
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
