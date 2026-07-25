const { build } = require('esbuild');
const pkg = require('./package.json');

// Stub out react-devtools-core (optional Ink dev dependency, not installed)
const stubDevtools = {
  name: 'stub-react-devtools-core',
  setup(build) {
    build.onResolve({ filter: /^react-devtools-core$/ }, () => ({
      path: 'react-devtools-core',
      namespace: 'stub',
    }));
    build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: 'export default undefined;',
    }));
  },
};

build({
  entryPoints: ['src/cli.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outfile: 'dist/sidekick-docker.mjs',
  banner: {
    js: [
      '#!/usr/bin/env node',
      // Polyfill CommonJS globals for bundled CJS deps in ESM output
      'import { createRequire as __createRequire } from "module";',
      'const require = __createRequire(import.meta.url);',
    ].join('\n'),
  },
  define: {
    '__CLI_VERSION__': JSON.stringify(pkg.version),
  },
  plugins: [stubDevtools, {
    name: 'stub-native-optionals',
    setup(b) {
      // ssh2 and cpu-features are optional deps of docker-modem, not needed for local socket
      for (const mod of ['ssh2', 'cpu-features']) {
        b.onResolve({ filter: new RegExp(`^${mod}$`) }, () => ({
          path: mod, namespace: 'stub-native',
        }));
      }
      b.onLoad({ filter: /.*/, namespace: 'stub-native' }, (args) => ({
        contents: args.path === 'ssh2'
          ? 'module.exports = { Client: class Client { connect() {} on() { return this; } end() {} } };'
          : 'module.exports = {};',
      }));
    },
  }],
  external: ['node-pty'],
  jsx: 'automatic',
  jsxImportSource: 'react',
  sourcemap: false,
  minify: false,
}).catch(() => process.exit(1));
