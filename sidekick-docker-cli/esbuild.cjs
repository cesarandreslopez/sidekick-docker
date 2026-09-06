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
      'const __dirname = import.meta.dirname;',
      'const __filename = import.meta.filename;',
    ].join('\n'),
  },
  define: {
    '__CLI_VERSION__': JSON.stringify(pkg.version),
  },
  plugins: [stubDevtools, require('../scripts/native-fallbacks.cjs')],
  external: ['node-pty'],
  jsx: 'automatic',
  jsxImportSource: 'react',
  sourcemap: false,
  minify: false,
}).catch(() => process.exit(1));
