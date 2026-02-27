# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1   | :x:                |

## Security Model

Sidekick Docker is designed to operate entirely on your local machine:

- **No credentials stored**: Connects to your local Docker socket — no API keys, tokens, or passwords are stored or transmitted
- **No telemetry**: No data is sent to external servers
- **All operations are local**: Every Docker command runs against your local (or explicitly configured) Docker daemon
- **Docker socket access**: Note that access to the Docker socket (`/var/run/docker.sock`) is equivalent to root access on the host. Sidekick Docker does not elevate privileges but inherits whatever access the socket provides

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do not** open a public issue
2. Email the maintainer directly or use GitHub's private vulnerability reporting feature
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

## Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial assessment**: Within 1 week
- **Resolution timeline**: Depends on severity, typically 1-4 weeks

## Security Best Practices for Users

1. **Keep dependencies updated**: Regularly update npm dependencies
2. **Restrict Docker socket access**: Ensure only trusted users can access the Docker socket
3. **Use TLS for remote Docker hosts**: When connecting to remote Docker daemons via TCP, use TLS

## Scope

This security policy covers:
- The CLI/TUI dashboard (`sidekick-docker-cli/`)
- The VS Code extension (`sidekick-docker-vscode/`)
- The shared library (`sidekick-docker-shared/`)

It does not cover:
- Docker Engine itself (report to Docker)
- dockerode (report to its maintainers)
- Third-party dependencies (report to respective maintainers)
