import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { spawn } from 'node:child_process';
import { setTimeout as waitMs } from 'node:timers/promises';
import * as http from 'node:http';
import type {
  ServerConfig,
  DockerStart,
  DockerComposeStart,
  ProcessStart,
} from './config.js';

export type StartedTarget = {
  baseUrl: string;
  stop: () => Promise<void>;
  capabilities: string[];
  meta: Record<string, unknown>;
};

export async function startTarget(cfg: ServerConfig): Promise<StartedTarget> {
  if (cfg.start.type === 'docker') {
    return startDockerTarget(cfg, cfg.start);
  } else if (cfg.start.type === 'docker-compose') {
    return startDockerComposeTarget(cfg, cfg.start);
  } else if (cfg.start.type === 'process') {
    return startProcessTarget(cfg, cfg.start);
  }
  throw new Error(`Unsupported start type: ${(cfg.start as any).type}`);
}

async function startDockerTarget(cfg: ServerConfig, start: DockerStart): Promise<StartedTarget> {
  console.log(`Starting Docker container: ${start.image}`);

  let container = new GenericContainer(start.image);

  // Configure platform
  if (start.platform) {
    container = container.withPlatform(start.platform);
  }

  // Configure ports
  const portMappings: Record<string, number> = {};
  if (start.ports) {
    for (const portSpec of start.ports) {
      const port = parseInt(portSpec.split('/')[0]);
      container = container.withExposedPorts(port);
    }
  }

  // Configure environment
  if (start.env) {
    for (const [key, value] of Object.entries(start.env)) {
      container = container.withEnvironment({ [key]: String(value) });
    }
  }

  // Configure volumes (using tmpfs for temp volumes)
  if (start.volumes) {
    for (const vol of start.volumes) {
      if (vol.type === 'temp') {
        container = container.withTmpFs({ [vol.target]: 'rw' });
      }
    }
  }

  // Start container
  const started = await container.start();

  // Get mapped ports
  if (start.ports) {
    for (const portSpec of start.ports) {
      const port = parseInt(portSpec.split('/')[0]);
      const mappedPort = started.getMappedPort(port);
      portMappings[`PORT_${port}`] = mappedPort;
    }
  }

  // Replace port placeholders in baseUrl
  let baseUrl = cfg.baseUrl;
  for (const [key, value] of Object.entries(portMappings)) {
    baseUrl = baseUrl.replace(`\${${key}}`, String(value));
  }

  // Wait for health check
  await waitForHttp(
    baseUrl + start.wait.http.path,
    start.wait.http.status,
    start.wait.http.timeoutMs
  );

  console.log(`Container started successfully at ${baseUrl}`);

  return {
    baseUrl,
    capabilities: cfg.capabilities ?? [],
    meta: {
      containerId: started.getId(),
      type: 'docker',
      image: start.image,
    },
    stop: async () => {
      console.log('Stopping Docker container...');
      await stopDockerContainer(started).catch(async (error) => {
        console.warn(
          `Graceful container stop failed (${error instanceof Error ? error.message : error}). Trying docker rm -f...`
        );
        await forceRemoveDockerContainer(started.getId());
      });
    },
  };
}

async function startProcessTarget(cfg: ServerConfig, start: ProcessStart): Promise<StartedTarget> {
  console.log(`Starting process: ${start.command} ${start.args?.join(' ') ?? ''}`);

  const child = spawn(start.command, start.args ?? [], {
    cwd: start.cwd,
    env: { ...process.env, ...(start.env ?? {}) },
    stdio: 'pipe',
  });

  // Capture logs
  const logs: string[] = [];
  child.stdout?.on('data', (data) => {
    const msg = data.toString();
    logs.push(msg);
    console.log(`[${cfg.name}] ${msg}`);
  });
  child.stderr?.on('data', (data) => {
    const msg = data.toString();
    logs.push(msg);
    console.error(`[${cfg.name}] ${msg}`);
  });

  child.on('error', (err) => {
    console.error(`Process error: ${err.message}`);
  });

  // Wait for health check
  const baseUrl = cfg.baseUrl;
  await waitForHttp(
    baseUrl + start.wait.http.path,
    start.wait.http.status,
    start.wait.http.timeoutMs
  );

  console.log(`Process started successfully at ${baseUrl}`);

  return {
    baseUrl,
    capabilities: cfg.capabilities ?? [],
    meta: {
      pid: child.pid,
      type: 'process',
      command: start.command,
      logs,
    },
    stop: async () => {
      console.log('Stopping process...');
      child.kill('SIGTERM');
      await waitMs(200);
      if (!child.killed) {
        child.kill('SIGKILL');
      }
    },
  };
}

async function startDockerComposeTarget(
  cfg: ServerConfig,
  start: DockerComposeStart,
): Promise<StartedTarget> {
  console.log(`Starting docker compose project: ${start.project}`);

  // Clean up any previous stack
  await dockerComposeDown(start).catch((error) => {
    console.warn(`Failed to clean docker compose project ${start.project}: ${error instanceof Error ? error.message : error}`);
  });

  const child = spawn('docker', composeArgs(start, 'up'), {
    cwd: start.cwd,
    env: { ...process.env, ...(start.env ?? {}) },
    stdio: 'pipe',
  });

  const logs: string[] = [];
  child.stdout?.on('data', (data) => {
    const msg = data.toString();
    logs.push(msg);
    console.log(`[${cfg.name}] ${msg}`);
  });
  child.stderr?.on('data', (data) => {
    const msg = data.toString();
    logs.push(msg);
    console.error(`[${cfg.name}] ${msg}`);
  });

  child.on('error', (err) => {
    console.error(`docker compose process error: ${err.message}`);
  });

  const baseUrl = cfg.baseUrl;
  await waitForHttp(
    baseUrl + start.wait.http.path,
    start.wait.http.status,
    start.wait.http.timeoutMs
  );

  console.log(`docker compose project ${start.project} ready at ${baseUrl}`);

  return {
    baseUrl,
    capabilities: cfg.capabilities ?? [],
    meta: {
      type: 'docker-compose',
      project: start.project,
      file: start.file,
      logs,
    },
    stop: async () => {
      console.log(`Stopping docker compose project ${start.project}...`);
      child.kill('SIGTERM');
      await waitMs(200);
      if (!child.killed) {
        child.kill('SIGKILL');
      }

      await dockerComposeDown(start).catch((error) => {
        console.warn(
          `Failed to stop docker compose project ${start.project}: ${
            error instanceof Error ? error.message : error
          }`
        );
      });
    },
  };
}

async function waitForHttp(url: string, expectStatus: number, timeoutMs: number): Promise<void> {
  const start = Date.now();
  let lastError: Error | null = null;

  while (Date.now() - start < timeoutMs) {
    try {
      const status = await new Promise<number>((resolve, reject) => {
        const req = http.get(url, (res) => {
          resolve(res.statusCode ?? 0);
          res.resume(); // Consume response
        });
        req.on('error', reject);
        req.setTimeout(2000);
      });

      if (status === expectStatus) {
        return;
      }
      lastError = new Error(`Expected status ${expectStatus}, got ${status}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
    await waitMs(250);
  }

  throw new Error(
    `Health check failed for ${url}: ${lastError?.message ?? 'timeout'}`
  );
}

async function stopDockerContainer(container: StartedTestContainer): Promise<void> {
  const stopTimeoutMs = 15_000;
  await Promise.race([
    container.stop({ timeout: 5_000, remove: true }),
    waitMs(stopTimeoutMs).then(() => {
      throw new Error(`Docker stop timed out after ${stopTimeoutMs}ms`);
    }),
  ]);
}

function composeArgs(start: DockerComposeStart, command: string, ...extra: string[]): string[] {
  return ['compose', '-p', start.project, '-f', start.file, command, ...extra];
}

async function dockerComposeDown(start: DockerComposeStart): Promise<void> {
  await runDockerCompose(start, ['down', '-v', '--remove-orphans']);
}

function runDockerCompose(start: DockerComposeStart, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('docker', composeArgs(start, ...args), {
      cwd: start.cwd,
      env: { ...process.env, ...(start.env ?? {}) },
      stdio: 'inherit',
    });

    proc.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`docker compose exited with code ${code}`));
      }
    });

    proc.on('error', reject);
  });
}

async function forceRemoveDockerContainer(containerId: string): Promise<void> {
  console.log(`Force removing Docker container ${containerId}...`);
  await new Promise<void>((resolve, reject) => {
    const proc = spawn('docker', ['rm', '-f', containerId], { stdio: 'inherit' });
    proc.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`docker rm -f exited with code ${code}`));
      }
    });
    proc.on('error', reject);
  });
}
