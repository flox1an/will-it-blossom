# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Will-it-Blossom is a conformance testing framework for Blossom servers. It provides capability-based testing for any Blossom server implementation (Rust, Node.js, etc.) by orchestrating server startup via Docker (Testcontainers) or local processes, running feature-specific tests, and generating detailed reports including JUnit XML and static HTML pages.

## Tech Stack

- **Runtime**: Node.js 20+ with PNPM
- **Language**: TypeScript
- **Test Framework**: Vitest
- **Orchestration**: Testcontainers (for Docker-based servers) + child_process (for local binaries)
- **HTTP Client**: undici or axios
- **Validation**: Zod for API response validation
- **Reporting**: Custom JSON reporter + JUnit XML + Markdown feature matrices

## Project Structure

```
servers/configs/        # Server configuration files (*.yml)
src/
  runner/
    index.ts           # CLI entry point: run, list, doctor commands
    orchestrator.ts    # Start/stop servers (Testcontainers/child_process)
    capabilities.ts    # Capability types and helpers
    config.ts          # Load/validate *.yml configs
    report.ts          # Generate JUnit/Markdown reports
    reporters/         # Custom Vitest reporters
  tests/
    core/              # Core Blossom features (health, upload, download)
    auth/              # Authentication tests (NIP-98)
    optional/          # Optional features (thumbnails, range requests)
  utils/               # HTTP and filesystem utilities
  fixtures/            # Test files (small images, videos)
artifacts/             # Test run outputs (timestamped)
  <runId>/
    manifest.json      # Run metadata
    <target>/
      results.json     # Structured test results
      junit.xml        # JUnit format for CI
      feature-matrix.md # Capability coverage
      server-info.json  # Server metadata
      logs/            # Server stdout/stderr
site/                  # Generated static website from artifacts
scripts/
  build-site.ts       # Static site generator from artifacts
```

## Key Commands

```bash
# Build the project
pnpm build

# Run tests against a specific server target
pnpm test:run --target rust-blossom

# Run tests against all configured targets
pnpm test:run --all

# List all tests and required capabilities
pnpm test:list

# Check prerequisites (Docker, ports, permissions)
pnpm test:doctor

# Generate static website from test artifacts
pnpm report:site

# Run Vitest directly
pnpm test
```

## Server Configuration

Server targets are defined in YAML files under `servers/configs/`. Each config specifies how to start the server (Docker or local process), capabilities it supports, and test parameters.

**Docker-based example** (`servers/configs/rust-blossom.yml`):
```yaml
name: "rust-blossom"
start:
  type: "docker"
  image: "ghcr.io/acme/blossom-rs:latest"
  platform: "linux/amd64"  # Optional: specify platform for cross-arch compatibility (e.g., on Mac ARM)
  env:
    BLOSSOM_PORT: "8080"
  ports:
    - "8080/tcp"
  wait:
    http:
      path: "/health"
      status: 200
      timeoutMs: 20000
baseUrl: "http://localhost:${PORT_8080}"
capabilities:
  - "core:health"
  - "core:upload"
  - "core:download"
  - "http:range-requests"
  - "auth:nip98"
```

**Local process example**:
```yaml
start:
  type: "process"
  command: "cargo"
  args: ["run", "--release", "--", "--port", "8081"]
  cwd: "/path/to/blossom-rs"
  wait:
    http:
      path: "/health"
      status: 200
      timeoutMs: 20000
baseUrl: "http://127.0.0.1:8081"
```

## Capability System

Tests are capability-driven. Each test declares which capabilities it requires, and is automatically skipped if the target server doesn't support them.

**Capability types** (`src/runner/capabilities.ts`):
- `core:health` - Health check endpoint
- `core:upload` - File upload
- `core:download` - File download
- `http:range-requests` - HTTP range request support
- `auth:nip98` - NIP-98 authentication
- `vendor:<custom>` - Vendor-specific extensions

**Example test with capability check**:
```typescript
import { testIf } from "../../runner/testIf";
import { requires } from "../../runner/capabilities";
import { ctx } from "../../runner/testCtx";

describe("HTTP Range Requests", () => {
  testIf(requires("http:range-requests")(ctx.capabilities))(
    "serves partial content",
    async () => {
      const res = await ctx.http.get(url, {
        headers: { Range: "bytes=0-99" }
      });
      expect(res.status).toBe(206);
    }
  );
});
```

## Orchestration Details

### Docker Targets
- Started via Testcontainers
- Automatic port mapping (dynamic ports assigned)
- Temporary volumes created and cleaned up after tests
- Health check via HTTP probe before tests start
- Cleanup in `afterAll` with `.stop({ remove: true })`

### Local Process Targets
- Started via `child_process.spawn`
- Logs captured (stdout/stderr)
- Health check via HTTP polling
- Cleanup via SIGTERM → SIGKILL in `finally` blocks

### Cleanup Guarantees
All orchestration code must ensure cleanup in `afterAll`/`finally` blocks:
- Docker containers stopped and removed
- Child processes killed
- Temporary directories deleted
- No resource leaks between test runs

## Reporting & Artifacts

Each test run creates a timestamped directory in `artifacts/` containing:

1. **results.json** - Structured test results with capabilities, test outcomes, durations
2. **junit.xml** - JUnit format for CI integration
3. **feature-matrix.md** - Human-readable capability coverage table
4. **server-info.json** - Server metadata (image, commit, spec version)
5. **logs/target.log** - Server stdout/stderr for debugging

The static site generator (`scripts/build-site.ts`) reads these artifacts and builds an HTML website in `site/` showing:
- All test runs with timestamps
- Per-target detailed results
- Test outcome tables
- Capability matrices

## Development Guidelines

### Adding New Tests
1. Place tests in appropriate subdirectory: `core/`, `auth/`, `optional/`
2. Declare required capabilities using `requires(...)`
3. Use `testIf` to conditionally run based on server capabilities
4. Use `ctx.baseUrl`, `ctx.http`, `ctx.capabilities` from test context
5. Clean up any test fixtures in `afterEach`/`afterAll`

### Adding New Capabilities
1. Add capability string type to `src/runner/capabilities.ts`
2. Update server configs to declare the capability
3. Write tests that require the new capability
4. No code changes needed in orchestrator

### Adding New Server Targets
1. Create new YAML config in `servers/configs/`
2. Specify start method (docker or process)
3. Declare capabilities
4. Add to `.blossomrc.yml` targets list
5. No code changes required

### Test Data & Fixtures
- Store small test files (images, videos) in `src/fixtures/`
- Generate larger temporary files at runtime if needed
- Always clean up generated fixtures after tests

## CI Integration

Tests can run in CI with matrix builds across multiple targets:

```yaml
strategy:
  matrix:
    target: [rust-blossom, node-blossom]
steps:
  - run: pnpm test:run --target ${{ matrix.target }}
  - uses: actions/upload-artifact@v3
    with:
      name: test-results-${{ matrix.target }}
      path: artifacts/
```

After all matrix jobs complete:
1. Combine artifacts
2. Run `pnpm report:site`
3. Deploy `site/` to GitHub Pages

## Architecture Notes

### Test Context Pattern
Tests receive a shared context object (`ctx`) containing:
- `baseUrl`: The running server's base URL (with dynamic port)
- `http`: Configured HTTP client
- `capabilities`: Array of server capabilities
- `fixtures`: Paths to test files

This context is initialized by the orchestrator after server startup.

### Capability-Based Skipping
The `testIf` helper wraps Vitest's `it.skip` to conditionally run tests:
```typescript
export function testIf(supported: boolean) {
  return supported ? it : it.skip;
}
```

Skipped tests appear in reports with reason: "requires capability X"

### Reporter Chain
Vitest runs with multiple reporters simultaneously:
1. Default console reporter (for developer feedback)
2. JUnit XML reporter (for CI systems)
3. Custom JSON reporter (for static site generation)

All reporters receive the same test events, ensuring consistent data across output formats.
