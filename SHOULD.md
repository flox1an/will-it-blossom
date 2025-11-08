# Handling SHOULD-Level Failures

1. **Capture Actual Failures**  
   - Run suites via `pnpm test:run --target <name>` (or equivalent) so `BLOSSOM_BASE_URL`/`BLOSSOM_TARGET` are set.  
   - Record each failing test with its spec clause and whether the requirement is MUST vs SHOULD.

2. **Classify Optional Expectations**  
   - Tag tests that cover SHOULD behaviors using capability flags or metadata (e.g., `requires('optional:range-requests')`).  
   - Ensure orchestration/reporting layers preserve that metadata so optional failures remain visible without blocking required conformance.

3. **Surface In Reports**  
   - Update artifacts/site generation to display optional failures separately (severity column or dedicated section).  
   - Keep historical tracking so repeated SHOULD regressions are easy to spot even if they are non-blocking.
