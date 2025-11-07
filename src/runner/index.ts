#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { loadRootConfig, loadServerConfig } from './config.js';
import { startTarget } from './orchestrator.js';
import { writeFeatureMatrix, writeServerInfo, writeManifest } from './reporters/feature-matrix.js';

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

async function runTests(targetName?: string) {
  const rootConfig = await loadRootConfig();
  const targets = targetName
    ? rootConfig.targets.filter(t => t.name === targetName)
    : rootConfig.targets;

  if (targets.length === 0) {
    console.error(`No targets found${targetName ? ` matching "${targetName}"` : ''}`);
    process.exit(1);
  }

  const runId = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const artifactsDir = join(process.cwd(), 'artifacts', runId);

  console.log(`Starting test run: ${runId}`);
  console.log(`Targets: ${targets.map(t => t.name).join(', ')}`);

  const manifestTargets: Array<{ id: string; path: string }> = [];

  for (const targetConfig of targets) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing target: ${targetConfig.name}`);
    console.log('='.repeat(60));

    const serverConfig = await loadServerConfig(targetConfig.config);
    const targetArtifactsDir = join(artifactsDir, targetConfig.name);

    let target;
    try {
      // Start the target
      target = await startTarget(serverConfig);

      // Write server info
      await writeServerInfo(targetArtifactsDir, {
        name: serverConfig.name,
        image: serverConfig.start.type === 'docker' ? serverConfig.start.image : undefined,
        command: serverConfig.start.type === 'process' ? serverConfig.start.command : undefined,
        capabilities: serverConfig.capabilities,
        limits: serverConfig.limits,
      });

      // Run vitest with the target
      const vitestArgs = [
        'vitest',
        'run',
        '--reporter=verbose',
        '--reporter=junit',
        `--outputFile=${join(targetArtifactsDir, 'junit.xml')}`,
      ];

      const env = {
        ...process.env,
        BLOSSOM_TARGET: targetConfig.name,
        BLOSSOM_BASE_URL: target.baseUrl,
        BLOSSOM_ARTIFACTS_DIR: targetArtifactsDir,
      };

      await new Promise<void>((resolve, reject) => {
        const proc = spawn('npx', vitestArgs, {
          stdio: 'inherit',
          env,
          shell: true,
        });

        proc.on('exit', (code) => {
          if (code === 0 || code === 1) {
            // 0 = all pass, 1 = some failures (still want to continue)
            resolve();
          } else {
            reject(new Error(`Vitest exited with code ${code}`));
          }
        });

        proc.on('error', reject);
      });

      // Write feature matrix
      await writeFeatureMatrix(targetArtifactsDir, serverConfig.capabilities, []);

      manifestTargets.push({
        id: targetConfig.name,
        path: join(targetConfig.name, 'results.json'),
      });

      console.log(`\nTarget ${targetConfig.name} completed`);
    } catch (error) {
      console.error(`Error testing ${targetConfig.name}:`, error);
    } finally {
      if (target) {
        await target.stop();
      }
    }
  }

  // Write manifest
  await writeManifest(artifactsDir, {
    runId,
    createdAt: new Date().toISOString(),
    targets: manifestTargets,
  });

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Test run complete: ${runId}`);
  console.log(`Artifacts: ${artifactsDir}`);
  console.log('='.repeat(60));
}

async function listTests() {
  console.log('Available tests:');
  console.log('\nCore tests:');
  console.log('  - Health check (requires: core:health)');
  console.log('  - Upload/Download (requires: core:upload, core:download)');
  console.log('  - List blobs (requires: core:list)');
  console.log('\nOptional tests:');
  console.log('  - Range requests (requires: http:range-requests)');
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
