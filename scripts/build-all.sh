#!/bin/bash
set -e

echo "Building sidekick-docker-shared..."
cd "$(dirname "$0")/../sidekick-docker-shared"
npm install
npm run build

echo "Building sidekick-docker-cli..."
cd ../sidekick-docker-cli
npm install
npm run build

echo "Building sidekick-docker-vscode..."
cd ../sidekick-docker-vscode
npm install
npm run build

echo "Build complete!"
echo "CLI binary at: sidekick-docker-cli/dist/sidekick-docker.mjs"
