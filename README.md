# Will It Blossom? 🌸

A conformance testing framework for [Blossom](https://github.com/hzrd149/blossom) servers.

## Features

- **Capability-based testing**: Tests automatically skip if the server doesn't support required features
- **Multi-target support**: Test multiple Blossom implementations in parallel
- **Docker & local process orchestration**: Start servers via Docker or run local binaries
- **Comprehensive reporting**: JUnit XML, JSON results, and beautiful static HTML reports
- **Automatic cleanup**: No resource leaks - containers and processes are always cleaned up

## Quick Start

### Prerequisites

- Node.js 20+
- PNPM (or npm/yarn)
- Docker (for Docker-based targets)

### Installation

```bash
pnpm install
```

### Check Environment

```bash
pnpm test:doctor
```

### Run Tests

Test the default target (almond):
```bash
pnpm test:run
```

Test a specific target:
```bash
pnpm test:run --target almond
```

Test all configured targets:
```bash
pnpm test:run --all
```

### Generate Reports

After running tests, generate a static website:
```bash
pnpm report:site
```

Then open `site/index.html` in your browser.

## Configuration

### Server Targets

Server configurations are stored in `servers/configs/*.yml`. Each configuration defines:

- **start**: How to start the server (Docker or local process)
- **baseUrl**: The base URL for API requests
- **capabilities**: Which Blossom features the server supports
- **limits**: Optional resource limits
- **secrets**: Optional authentication credentials

Example (`servers/configs/almond.yml`):

```yaml
name: "almond"
start:
  type: "docker"
  image: "ghcr.io/flox1an/almond:main"
  env:
    PORT: "8080"
  ports:
    - "8080/tcp"
  wait:
    http:
      path: "/"
      status: 200
      timeoutMs: 30000
baseUrl: "http://localhost:${PORT_8080}"
capabilities:
  - "core:health"
  - "core:upload"
  - "core:download"
  - "core:list"
```

### Root Configuration

The `.blossomrc.yml` file selects which targets to test:

```yaml
defaultTarget: almond
targets:
  - name: almond
    config: ./servers/configs/almond.yml
```

## Capabilities

The framework supports the following capabilities:

### Core
- `core:health` - Health check endpoint
- `core:upload` - File upload
- `core:download` - File download
- `core:list` - List stored blobs

### Optional
- `http:range-requests` - HTTP range request support
- `auth:nip98` - NIP-98 authentication
- `media:thumbnails` - Thumbnail generation

Tests that require unsupported capabilities are automatically skipped.

## Adding a New Server Target

1. Create a configuration file in `servers/configs/<name>.yml`
2. Define how to start the server (Docker image or local command)
3. Declare which capabilities the server supports
4. Add it to `.blossomrc.yml`
5. Run `pnpm test:run --target <name>`

No code changes required!

## Project Structure

```
servers/configs/        # Server configuration files
src/
  runner/              # Test orchestration and CLI
    orchestrator.ts    # Docker/process management
    capabilities.ts    # Capability types
    config.ts          # Configuration loading
    reporters/         # Custom test reporters
  tests/
    core/              # Core Blossom tests
    optional/          # Optional feature tests
  utils/               # Shared utilities
artifacts/             # Test results (timestamped runs)
site/                  # Generated static website
scripts/
  build-site.ts       # Static site generator
```

## Development

### Build TypeScript

```bash
pnpm build
```

### Run Tests in Watch Mode

```bash
pnpm test:watch
```

### List Available Tests

```bash
pnpm test:list
```

## CI Integration

Example GitHub Actions workflow:

```yaml
name: Test Blossom Servers

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        target: [almond, blossom-server]
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install
      - run: pnpm test:run --target ${{ matrix.target }}
      - uses: actions/upload-artifact@v3
        with:
          name: test-results-${{ matrix.target }}
          path: artifacts/
```

## Known Issues

### Platform Compatibility

Some Blossom server Docker images (like almond) are built for `linux/amd64` only. On ARM-based Macs (M1/M2/M3), these containers may fail to start or crash immediately due to emulation issues.

**Workarounds:**
1. Run tests on a linux/amd64 machine or CI environment
2. Build ARM-compatible images for the target servers
3. Use the `process` start type to run servers as local binaries instead of Docker containers

To run almond locally without Docker:
```bash
# Clone and build almond
git clone https://github.com/flox1an/almond
cd almond
cargo build --release

# Update servers/configs/almond.yml to use process type:
start:
  type: "process"
  command: "./target/release/almond"
  cwd: "/path/to/almond"
```

## License

MIT
