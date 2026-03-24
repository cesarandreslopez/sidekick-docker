# Contributing

Thank you for your interest in contributing to Sidekick Docker! This page mirrors the [CONTRIBUTING.md](https://github.com/cesarandreslopez/sidekick-docker/blob/main/CONTRIBUTING.md) in the repository.

## Getting Started

### Prerequisites

- Node.js 20+
- Docker running
- VS Code 1.85+ (for extension development)

### Development Setup

```bash
git clone https://github.com/cesarandreslopez/sidekick-docker.git
cd sidekick-docker
bash scripts/build-all.sh
npm test
```

### Running Locally

- **TUI dashboard**: `./sidekick-docker-cli/dist/sidekick-docker.mjs`
- **VS Code extension**: Open `sidekick-docker-vscode/` in VS Code and press `F5`

## Available Commands

```bash
npm run build              # Full build (shared -> cli -> vscode)
npm run build:shared       # Shared library only
npm run build:cli          # CLI only
npm run build:vscode       # VS Code extension only
npm test                   # Run all tests
npm run lint               # Lint all packages (ESLint 9)
npm run lint:fix           # Lint + auto-fix
```

## Code Style

- TypeScript strict mode everywhere
- Vitest for testing, co-located `.test.ts` files
- ESLint 9 (flat config) for code quality — run `npm run lint` before submitting PRs
- [Conventional Commits](https://www.conventionalcommits.org/) for commit messages

## Making Changes

1. Create a feature branch from `main`
2. Make your changes with clear commits
3. Ensure linting and tests pass (`npm run lint && npm test`)
4. Update documentation if needed
5. Submit a PR with a clear description

## Areas for Contribution

- Test coverage improvements
- New container actions (attach, inspect)
- Remote Docker host support
- Documentation and developer experience
- Bug fixes

Look for issues labeled `good first issue` for newcomers.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
