#!/bin/bash
set -e

cd "$(dirname "$0")/.."

echo "Linting all packages..."
npx eslint sidekick-docker-shared/src sidekick-docker-cli/src sidekick-docker-vscode/src "$@"

echo "Lint complete!"
