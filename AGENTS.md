# Repository Guidelines

## Project Structure & Module Organization
- `src/runner/` provides the CLI, orchestration, and reporting utilities (`index.ts`, `orchestrator.ts`, `reporters/`).
- `src/tests/` holds capability-scoped suites (`core/`, `optional/`) plus shared context in `setup.ts`; mirror this layout when adding new coverage.
- Server target descriptors live in `servers/configs/*.yml`, while `.blossomrc.yml` selects which targets run by default.
- Test outputs (JUnit, feature matrices, server metadata) land under `artifacts/<runId>/<target>/`; keep these paths stable for tooling.
- Static reports are generated into `site/`, and auxiliary build scripts live in `scripts/`.

## Build, Test, and Development Commands
- `pnpm build` — type-check and emit compiled JS to `dist/`.
- `pnpm test` or `pnpm vitest run` — execute unit/integration suites without spinning up targets.
- `pnpm test:run [--target <name>|--all]` — full orchestration flow; populates `artifacts/`.
- `pnpm test:list` — enumerate tests with their required capabilities; use before assigning work to agents.
- `pnpm test:doctor` — verify Docker/Testcontainers prerequisites.
- `pnpm report:site` — convert the latest artifacts into the browsable site; run after successful end-to-end executions.

## Coding Style & Naming Conventions
- TypeScript with ES modules (`type: "module"`); prefer top-level `import`/`export` and async/await flows.
- Use 2-space indentation, single quotes, and trailing commas for multi-line literals to match existing files.
- Tests are named `<feature>.test.ts` and grouped by capability tier; describe blocks follow the pattern `describe('Core: Feature', ...)`.
- Utilities exposing capabilities or context should live in `src/runner/*` and be exported via barrel-style modules when shared.

## Testing Guidelines
- Vitest is the sole runner; rely on `testIf(requires('capability')(...))` to gate tests so reports accurately reflect unsupported features.
- Place shared setup in `src/tests/setup.ts` and access `ctx.baseUrl`, `ctx.http`, and `ctx.capabilities` instead of reconfiguring clients per file.
- Record new capability strings in `src/runner/capabilities.ts`, update relevant server configs, and add coverage in the matching `core/` or `optional/` suite.
- Always inspect `artifacts/<runId>/<target>/junit.xml` or `results.json` before shipping changes; attach these when discussing regressions.

## Commit & Pull Request Guidelines
- Write imperative, scope-aware commit subjects referencing the feature under test (e.g., `feat: cover http range requests`); squash fixups before review.
- PRs should state the targeted capabilities, mention affected targets/configs, and include the command used (e.g., `pnpm test:run --target almond`) plus a summary of pass/fail counts.
- Link issues or specs when touching protocol requirements, and add screenshots of `report:site` output when UI artifacts change.
- Confirm Docker/Testcontainers cleanup occurs (no orphaned containers) and note any manual steps for reviewers.

## Security & Configuration Tips
- Store secrets or credentials inside the corresponding `servers/configs/*.yml` entry under `secrets`; never hard-code them in source.
- When working on ARM hosts, set the `start.platform` field in configs to avoid cross-architecture Docker failures, or switch targets to the `process` mode.
- Ensure `DOCKER_HOST` resolves before running orchestration (the CLI auto-detects OrbStack, Docker Desktop, and `/var/run/docker.sock`, but verify when using custom setups).
