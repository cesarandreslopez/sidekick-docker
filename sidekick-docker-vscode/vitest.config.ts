import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      // The real `vscode` module only exists inside the extension host;
      // unit tests run against a minimal mock.
      vscode: fileURLToPath(new URL('./src/test/vscode.ts', import.meta.url)),
    },
  },
});
