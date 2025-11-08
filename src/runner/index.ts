#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import type { ServerConfig } from './config.js';
import { loadRootConfig, loadServerConfig } from './config.js';
import { startTarget, type StartedTarget } from './orchestrator.js';
import { writeFeatureMatrix, writeServerInfo, writeManifest } from './reporters/feature-matrix.js';
import { writeRunResultsFromJUnit } from './reporters/json-reporter.js';
import { LOGGING } from './constants.js';

// Ensure DOCKER_HOST is set for Testcontainers
// Check common Docker socket locations if not already set
if (!process.env.DOCKER_HOST) {
  const socketPaths = [
    `${homedir()}/.orbstack/run/docker.sock`,  // OrbStack
    `${homedir()}/.docker/run/docker.sock`,     // Docker Desktop
    '/var/run/docker.sock',                      // Standard Linux
  ];

  for (const socketPath of socketPaths) {
    if (existsSync(socketPath)) {
      process.env.DOCKER_HOST = `unix://${socketPath}`;
      console.log(`Using Docker socket: ${socketPath}`);
      break;
    }
  }

  if (!process.env.DOCKER_HOST) {
    console.warn('Warning: Could not detect Docker socket. Testcontainers may fail.');
  }
}

const [, , command, ...args] = process.argv;

interface RunContext {
  runId: string;
  artifactsDir: string;
}

interface TargetResult {
  id: string;
  path: string;
}

/**
 * Initializes a test run by creating a unique run ID and artifacts directory.
 */
function initializeRun(): RunContext {
  const runId = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const artifactsDir = join(process.cwd(), 'artifacts', runId);
  return { runId, artifactsDir };
}

/**
 * Runs internal tests (helper and runner unit tests) that must pass before running spec tests.
 * Internal tests run with fail-fast behavior - any failure stops execution immediately.
 */
async function runInternalTests(): Promise<void> {
  console.log('\nRunning internal tests...');

  const vitestArgs = [
    'vitest',
    'run',
    '--reporter=verbose',
    '--bail=1', // Exit immediately on first failure
    // Include all __tests__ directories (runner and helper tests)
    'src/runner/__tests__',
    'src/tests/helpers/__tests__',
  ];

  await new Promise<void>((resolve, reject) => {
    const proc = spawn('npx', vitestArgs, {
      stdio: 'inherit',
      env: process.env,
    });

    proc.on('exit', (code) => {
      if (code === 0) {
        console.log('✓ All internal tests passed\n');
        resolve();
      } else {
        reject(new Error(
          `Internal tests failed with code ${code}. ` +
          `Spec tests will not run until internal tests pass.`
        ));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to run internal tests: ${err.message}`));
    });
  });
}

/**
 * Runs Vitest tests for a specific target (spec tests only, excluding internal tests).
 */
async function runVitestForTarget(
  targetName: string,
  baseUrl: string,
  artifactsDir: string
): Promise<void> {
  const vitestArgs = [
    'vitest',
    'run',
    '--reporter=verbose',
    '--reporter=junit',
    `--outputFile=${join(artifactsDir, 'junit.xml')}`,
    // Exclude all internal tests from spec test runs
    '--exclude=**/__tests__/**',
  ];

  const env = {
    ...process.env,
    BLOSSOM_TARGET: targetName,
    BLOSSOM_BASE_URL: baseUrl,
    BLOSSOM_ARTIFACTS_DIR: artifactsDir,
  };

  await new Promise<void>((resolve, reject) => {
    const proc = spawn('npx', vitestArgs, {
      stdio: 'inherit',
      env,
      // Note: shell: true removed for security
    });

    proc.on('exit', (code) => {
      if (code === 0 || code === 1) {
        // 0 = all pass, 1 = some failures (still want to continue)
        resolve();
      } else {
        reject(new Error(`Vitest exited with code ${code} for target ${targetName}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn vitest for target ${targetName}: ${err.message}`));
    });
  });
}

/**
 * Generates test reports (JSON, feature matrix) for a target.
 */
async function generateReportsForTarget(
  runContext: RunContext,
  targetName: string,
  baseUrl: string,
  serverConfig: ServerConfig,
  targetArtifactsDir: string
): Promise<TargetResult | undefined> {
  const results = await writeRunResultsFromJUnit({
    junitPath: join(targetArtifactsDir, 'junit.xml'),
    outDir: targetArtifactsDir,
    meta: {
      runId: runContext.runId,
      target: targetName,
      baseUrl,
      specVersion: serverConfig.specVersion,
      capabilities: serverConfig.capabilities,
    },
  }).catch(error => {
    console.error(`Failed to build JSON results for ${targetName}:`, error);
    return undefined;
  });

  await writeFeatureMatrix(targetArtifactsDir, serverConfig.capabilities, results?.tests ?? []);

  if (results) {
    return {
      id: targetName,
      path: join(targetName, 'results.json'),
    };
  }

  return undefined;
}

/**
 * Tests a single target server.
 */
async function runTargetTests(
  runContext: RunContext,
  targetConfig: { name: string; config: string }
): Promise<TargetResult | undefined> {
  console.log(`\n${'='.repeat(LOGGING.SEPARATOR_LENGTH)}`);
  console.log(`Testing target: ${targetConfig.name}`);
  console.log('='.repeat(LOGGING.SEPARATOR_LENGTH));

  const serverConfig = await loadServerConfig(targetConfig.config);
  const targetArtifactsDir = join(runContext.artifactsDir, targetConfig.name);

  let target: StartedTarget | undefined;
  try {
    // Start the target server
    target = await startTarget(serverConfig);

    // Write server metadata
    await writeServerInfo(targetArtifactsDir, {
      name: serverConfig.name,
      baseUrl: target.baseUrl,
      image: serverConfig.start.type === 'docker' ? serverConfig.start.image : undefined,
      command: serverConfig.start.type === 'process' ? serverConfig.start.command : undefined,
      specVersion: serverConfig.specVersion,
      capabilities: serverConfig.capabilities,
      limits: serverConfig.limits,
    });

    // Run tests
    await runVitestForTarget(targetConfig.name, target.baseUrl, targetArtifactsDir);

    // Generate reports
    const result = await generateReportsForTarget(
      runContext,
      targetConfig.name,
      target.baseUrl,
      serverConfig,
      targetArtifactsDir
    );

    console.log(`\nTarget ${targetConfig.name} completed successfully`);
    return result;
  } catch (error) {
    console.error(`Error testing ${targetConfig.name}:`, error instanceof Error ? error.message : error);
    return undefined;
  } finally {
    if (target) {
      await target.stop().catch(err => {
        console.error(`Failed to stop target ${targetConfig.name}:`, err instanceof Error ? err.message : err);
      });
    }
  }
}

/**
 * Finalizes a test run by writing the manifest and summary.
 */
async function finalizeRun(runContext: RunContext, targetResults: TargetResult[]): Promise<void> {
  await writeManifest(runContext.artifactsDir, {
    runId: runContext.runId,
    createdAt: new Date().toISOString(),
    targets: targetResults,
  });

  console.log(`\n${'='.repeat(LOGGING.SEPARATOR_LENGTH)}`);
  console.log(`Test run complete: ${runContext.runId}`);
  console.log(`Artifacts: ${runContext.artifactsDir}`);
  console.log(`Tested ${targetResults.length} target(s)`);
  console.log('='.repeat(LOGGING.SEPARATOR_LENGTH));
}

/**
 * Runs conformance tests against configured Blossom server targets.
 *
 * @param targetName - Optional specific target name to test (tests all if not provided)
 */
async function runTests(targetName?: string): Promise<void> {
  const rootConfig = await loadRootConfig();
  const targets = targetName
    ? rootConfig.targets.filter(t => t.name === targetName)
    : rootConfig.targets;

  if (targets.length === 0) {
    console.error(
      `No targets found${targetName ? ` matching "${targetName}"` : ''}. ` +
      `Check your .blossomrc.yml configuration.`
    );
    process.exit(1);
  }

  // Run internal tests first with fail-fast behavior
  // If these fail, the entire test run is aborted
  await runInternalTests();

  const runContext = initializeRun();

  console.log(`Starting test run: ${runContext.runId}`);
  console.log(`Targets: ${targets.map(t => t.name).join(', ')}`);

  const targetResults: TargetResult[] = [];

  for (const targetConfig of targets) {
    const result = await runTargetTests(runContext, targetConfig);
    if (result) {
      targetResults.push(result);
    }
  }

  await finalizeRun(runContext, targetResults);
}

async function listTests() {
  console.log('Available tests:');
  console.log('\nCore tests:');
  console.log('  - Health check (requires: core:health)');
  console.log('  - CORS & preflight headers (requires: core:health)');
  console.log('  - Upload/Download (requires: core:upload, core:download)');
  console.log('  - List blobs by pubkey (requires: core:list, auth:nip98)');
  console.log('  - Delete blobs (requires: core:delete, auth:nip98)');
  console.log('\nOptional tests:');
  console.log('  - Range requests (requires: http:range-requests)');
  console.log('  - Mirror endpoint (requires: bud04:mirror, auth:nip98)');
  console.log('  - Media optimization (requires: bud05:media)');
  console.log('  - HEAD /upload requirements (requires: bud06:upload-head)');
  console.log('  - Payment-required endpoints (requires: bud07:payments)');
  console.log('  - NIP-94 metadata (requires: bud08:nip94)');
  console.log('  - Blob reporting (requires: bud09:report)');
}

async function doctor() {
  console.log('Checking environment...\n');

  // Check Node version
  const nodeVersion = process.version;
  console.log(`✓ Node.js: ${nodeVersion}`);

  // Check if Docker is available
  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn('docker', ['--version'], { stdio: 'pipe' });
      proc.on('exit', (code) => (code === 0 ? resolve() : reject()));
      proc.on('error', reject);
    });
    console.log('✓ Docker: Available');
  } catch {
    console.log('✗ Docker: Not available (required for Docker-based targets)');
  }

  // Check configuration
  try {
    const config = await loadRootConfig();
    console.log(`✓ Configuration: ${config.targets.length} target(s) configured`);
    for (const target of config.targets) {
      console.log(`  - ${target.name}: ${target.config}`);
    }
  } catch (error) {
    console.log('✗ Configuration: Error loading .blossomrc.yml');
    console.error(error);
  }

  console.log('\nEnvironment check complete.');
}

async function main() {
  switch (command) {
    case 'run': {
      const targetFlag = args.indexOf('--target');
      const targetName = targetFlag >= 0 ? args[targetFlag + 1] : undefined;
      const all = args.includes('--all');

      if (all) {
        await runTests();
      } else {
        await runTests(targetName);
      }
      break;
    }
    case 'list':
      await listTests();
      break;
    case 'doctor':
      await doctor();
      break;
    default:
      console.log('Usage:');
      console.log('  pnpm test:run [--target <name>] [--all]');
      console.log('  pnpm test:list');
      console.log('  pnpm test:doctor');
      process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
