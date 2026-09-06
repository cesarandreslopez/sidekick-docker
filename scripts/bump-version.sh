#!/usr/bin/env bash
set -euo pipefail

# Bump the root and all 3 packages, including lockfile metadata.
# Usage: bash scripts/bump-version.sh 0.4.1

VERSION="${1:-}"

if [[ -z "$VERSION" ]]; then
  echo "Usage: $0 <semver>"
  echo "Example: $0 0.4.1"
  exit 1
fi

# Validate semver format (major.minor.patch, optional pre-release)
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$ ]]; then
  echo "Error: '$VERSION' is not valid semver (expected X.Y.Z or X.Y.Z-pre.N)"
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

node - "$REPO_ROOT" "$VERSION" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const [root, version] = process.argv.slice(2);
const directories = ['.', 'sidekick-docker-shared', 'sidekick-docker-cli', 'sidekick-docker-vscode'];
const updates = [];

// Read every file before writing so missing or invalid metadata fails up front.
for (const directory of directories) {
  for (const name of ['package.json', 'package-lock.json']) {
    const file = path.join(root, directory, name);
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const previous = data.version;
    data.version = version;
    if (name === 'package-lock.json') {
      data.packages[''].version = version;
      const shared = data.packages['../sidekick-docker-shared'];
      if (shared) shared.version = version;
    }
    updates.push({ file, data, previous });
  }
}

for (const { file, data, previous } of updates) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
  console.log(`  ${path.relative(root, file)}: ${previous} -> ${version}`);
}
NODE

echo ""
echo "All packages bumped to $VERSION."
echo ""
echo "Next steps:"
echo "  1. Update the root, CLI, extension, and docs changelogs and relevant documentation"
echo "  2. Run the validation gate in AGENTS.md and npm run test:packages"
echo "  3. Commit the release changes and push main; wait for CI and documentation deployment"
echo "  4. git tag -a v$VERSION -m 'Release v$VERSION'"
echo "  5. git push origin v$VERSION and monitor the Release workflow"
