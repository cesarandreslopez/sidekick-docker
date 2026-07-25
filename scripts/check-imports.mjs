#!/usr/bin/env node

/**
 * Import DAG linter — enforces module dependency rules.
 *
 * Usage: node scripts/check-imports.mjs
 *
 * See specs/_archive/refactor/architecture.md for the dependency DAG.
 * Each module may only import from its listed dependencies.
 * External (npm) packages are always allowed.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, dirname, join, normalize } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

// ─── Module classification ──────────────────────────────────────────────

const SHARED_SRC = 'sidekick-docker-shared/src';
const CLI_SRC = 'sidekick-docker-cli/src';
const VSCODE_SRC = 'sidekick-docker-vscode/src';

/**
 * Given a file path relative to the repo root, return its module name.
 * Returns null for files that don't map to a known module.
 */
function classifyFile(relPath) {
  if (relPath.startsWith(SHARED_SRC + '/')) {
    const rest = relPath.slice(SHARED_SRC.length + 1);
    if (rest.startsWith('types/')) return 'shared/types';
    if (rest.startsWith('docker/')) return 'shared/docker';
    if (rest.startsWith('compose/')) return 'shared/compose';
    if (rest.startsWith('log/')) return 'shared/log';
    if (rest.startsWith('events/')) return 'shared/events';
    if (rest.startsWith('stats/')) return 'shared/stats';
    return 'shared/core';
  }
  if (relPath.startsWith(CLI_SRC + '/')) {
    const rest = relPath.slice(CLI_SRC.length + 1);
    if (rest.startsWith('commands/') || rest === 'cli.ts') return 'cli/commands';
    if (rest.startsWith('formatters')) return 'cli/formatters'; // formatters.ts, formatters.test.ts
    if (rest.startsWith('utils/')) return 'cli/utils';
    if (rest.startsWith('dashboard/panels/')) return 'cli/panels';
    if (rest.startsWith('dashboard/ink/')) return 'cli/ink';
    if (rest.startsWith('dashboard/')) return 'cli/state';
    return null;
  }
  if (relPath.startsWith(VSCODE_SRC + '/')) {
    const rest = relPath.slice(VSCODE_SRC.length + 1);
    if (rest === 'extension.ts') return 'vscode/extension';
    if (rest.startsWith('providers/')) return 'vscode/providers';
    if (rest.startsWith('services/')) return 'vscode/services';
    if (rest.startsWith('types/')) return 'vscode/types';
    if (rest.startsWith('utils/')) return 'vscode/utils';
    if (rest.startsWith('webview/')) return 'vscode/webview';
    return null;
  }
  return null;
}

/**
 * Given a relative import specifier resolved to a repo-relative path,
 * return the target module name.
 */
function classifyImportTarget(sourceRelPath, importSpecifier) {
  // Package imports from shared
  if (importSpecifier === 'sidekick-docker-shared' ||
      importSpecifier.startsWith('sidekick-docker-shared/')) {
    return 'shared';
  }

  // External packages (not relative)
  if (!importSpecifier.startsWith('.')) {
    return null; // external — always allowed
  }

  // Relative import — resolve to repo-relative path
  const sourceDir = dirname(resolve(ROOT, sourceRelPath));
  const resolved = normalize(resolve(sourceDir, importSpecifier));
  const resolvedRel = relative(ROOT, resolved);

  // Check if target is a directory (e.g., '../types' → 'types/index.ts')
  const isDir = statSync(resolved, { throwIfNoEntry: false })?.isDirectory();
  if (isDir) {
    return classifyFile(resolvedRel + '/index.ts');
  }
  return classifyFile(resolvedRel + '.ts') ?? classifyFile(resolvedRel + '.tsx');
}

// ─── Allowed dependencies (from architecture.md) ───────────────────────

const ALLOWED_DEPS = {
  // === Shared package sub-modules ===
  'shared/types':   [],
  'shared/docker':  ['shared/types'],
  'shared/compose': ['shared/types'],
  'shared/log':     [],
  'shared/events':  ['shared/docker', 'shared/types'],
  'shared/stats':   ['shared/types'],
  'shared/core':    ['shared/types',
                     'shared/docker', 'shared/compose', 'shared/events',
                     'shared/stats', 'shared/log'], // barrel index.ts re-exports all sub-modules

  // === CLI package ===
  'cli/utils':      ['shared'], // connect/textTable wrap DockerClient + shared formatters
  'cli/formatters': ['shared'],
  // utils only depends on shared, so this edge introduces no cycle. State and
  // the stream managers need the debug sink (stderr, opt-in) because plain
  // console.* writes to stdout, which Ink owns while the dashboard is mounted.
  'cli/state':      ['cli/utils', 'shared'],
  'cli/panels':     ['cli/state', 'cli/formatters', 'shared'],
  'cli/ink':        ['cli/panels', 'cli/state', 'cli/formatters', 'shared'],
  'cli/commands':   ['cli/ink', 'cli/panels', 'cli/state', 'cli/formatters', 'cli/utils', 'shared'],

  // === VSCode package ===
  'vscode/utils':     ['shared'], // workspace.ts consumes ComposeFileReader
  'vscode/types':     [],
  'vscode/services':  ['shared', 'vscode/types'],
  'vscode/providers': ['vscode/services', 'vscode/types', 'vscode/utils', 'shared'],
  'vscode/webview':   ['vscode/types', 'shared'],
  'vscode/extension': ['vscode/providers', 'vscode/services', 'shared'],
};

// ─── File discovery ─────────────────────────────────────────────────────

function findFiles(dir, exts) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== 'out') {
      results.push(...findFiles(full, exts));
    } else if (entry.isFile() && exts.some(ext => entry.name.endsWith(ext))) {
      results.push(full);
    }
  }
  return results;
}

// ─── Import extraction ──────────────────────────────────────────────────

const IMPORT_RE = /^import\s+(?:type\s+)?(?:\{[^}]*\}|[^;'"]*)\s+from\s+['"]([^'"]+)['"]/gm;
const REQUIRE_RE = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/gm;

function extractImports(source) {
  const imports = new Set();
  for (const m of source.matchAll(IMPORT_RE)) imports.add(m[1]);
  for (const m of source.matchAll(REQUIRE_RE)) imports.add(m[1]);
  return [...imports];
}

// ─── Check logic ────────────────────────────────────────────────────────

/**
 * Check if sourceModule is allowed to import targetModule.
 * - Same-module imports are always allowed.
 * - 'shared' (package-level) is allowed if any shared/* sub-module is allowed.
 */
function isAllowed(sourceModule, targetModule) {
  if (targetModule === null) return true; // external package
  if (sourceModule === targetModule) return true; // same module

  const allowed = ALLOWED_DEPS[sourceModule];
  if (!allowed) return true; // unknown module — skip

  // If target is 'shared' (package import), allow if source lists any shared/* dep or 'shared'
  if (targetModule === 'shared') {
    return allowed.some(dep => dep === 'shared' || dep.startsWith('shared/'));
  }

  return allowed.includes(targetModule);
}

// ─── Main ───────────────────────────────────────────────────────────────

const srcDirs = [
  join(ROOT, SHARED_SRC),
  join(ROOT, CLI_SRC),
  join(ROOT, VSCODE_SRC),
];

let violations = 0;

for (const srcDir of srcDirs) {
  if (!statSync(srcDir, { throwIfNoEntry: false })) continue;
  const files = findFiles(srcDir, ['.ts', '.tsx']);

  for (const file of files) {
    const relPath = relative(ROOT, file);
    const sourceModule = classifyFile(relPath);
    if (!sourceModule) continue;

    const source = readFileSync(file, 'utf8');
    const imports = extractImports(source);

    for (const imp of imports) {
      const targetModule = classifyImportTarget(relPath, imp);
      if (!isAllowed(sourceModule, targetModule)) {
        console.error(
          `VIOLATION: ${relPath} (${sourceModule}) → ${imp} (${targetModule})`
        );
        violations++;
      }
    }
  }
}

if (violations > 0) {
  console.error(`\n${violations} import violation(s) found.`);
  process.exit(1);
} else {
  console.log('Import DAG: OK (no violations)');
}
