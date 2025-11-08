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
import { TIMEOUTS, LOGGING } from './constants.js';

/**
 * Represents a started server target with cleanup capabilities.
 */
export type StartedTarget = {
  /** Base URL where the server is accessible */
  baseUrl: string;
  /** Function to stop and cleanup the server */
  stop: () => Promise<void>;
  /** List of capabilities supported by this server */
  capabilities: string[];
  /** Metadata about the running server */
  meta: Record<string, unknown>;
};

/**
 * Starts a server target based on its configuration.
 * Supports Docker containers, Docker Compose projects, and local processes.
 *
 * @param cfg - Server configuration from YAML file
 * @returns Started target with baseUrl and stop function
 * @throws {Error} If server fails to start or health check fails
 */
export async function startTarget(cfg: ServerConfig): Promise<StartedTarget> {
  if (cfg.start.type === 'docker') {
    return startDockerTarget(cfg, cfg.start);
  } else if (cfg.start.type === 'docker-compose') {
    return startDockerComposeTarget(cfg, cfg.start);
  } else if (cfg.start.type === 'process') {
    return startProcessTarget(cfg, cfg.start);
  }
  const unknownType = (cfg.start as any).type;
  throw new Error(
    `Unsupported start type "${unknownType}" for target "${cfg.name}". ` +
    `Supported types: docker, docker-compose, process`
  );
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

  // Capture logs (with size limit to prevent memory issues)
  const logs: string[] = [];
  child.stdout?.on('data', (data) => {
    const msg = data.toString();
    if (logs.length < LOGGING.MAX_LOG_ENTRIES) {
      logs.push(msg);
    }
    console.log(`[${cfg.name}] ${msg}`);
  });
  child.stderr?.on('data', (data) => {
    const msg = data.toString();
    if (logs.length < LOGGING.MAX_LOG_ENTRIES) {
      logs.push(msg);
    }
    console.error(`[${cfg.name}] ${msg}`);
  });

  child.on('error', (err) => {
    console.error(`Process error for ${cfg.name}: ${err.message}`);
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
      console.log(`Stopping process: ${cfg.name} (PID: ${child.pid})...`);
      if (!child.pid) {
        console.warn(`Process ${cfg.name} has no PID, cannot stop`);
        return;
      }

      child.kill('SIGTERM');
      await waitMs(TIMEOUTS.PROCESS_INITIAL_WAIT);
      if (!child.killed) {
        console.warn(`Process ${cfg.name} did not respond to SIGTERM, sending SIGKILL`);
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
    if (logs.length < LOGGING.MAX_LOG_ENTRIES) {
      logs.push(msg);
    }
    console.log(`[${cfg.name}] ${msg}`);
  });
  child.stderr?.on('data', (data) => {
    const msg = data.toString();
    if (logs.length < LOGGING.MAX_LOG_ENTRIES) {
      logs.push(msg);
    }
    console.error(`[${cfg.name}] ${msg}`);
  });

  child.on('error', (err) => {
    console.error(`docker compose process error for ${cfg.name}: ${err.message}`);
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
      if (child.pid) {
        child.kill('SIGTERM');
        await waitMs(TIMEOUTS.PROCESS_INITIAL_WAIT);
        if (!child.killed) {
          console.warn(`Docker compose process for ${start.project} did not respond to SIGTERM, sending SIGKILL`);
          child.kill('SIGKILL');
        }
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
        req.setTimeout(TIMEOUTS.HEALTH_CHECK_REQUEST);
      });

      if (status === expectStatus) {
        return;
      }
      lastError = new Error(`Expected status ${expectStatus}, got ${status}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
    await waitMs(TIMEOUTS.HEALTH_CHECK_RETRY);
  }

  throw new Error(
    `Health check failed for ${url} after ${timeoutMs}ms: ${lastError?.message ?? 'timeout'}`
  );
}

/**
 * Stops and removes a Docker container with timeout protection.
 *
 * @param container - The running container to stop
 * @throws {Error} If stop operation times out
 */
async function stopDockerContainer(container: StartedTestContainer): Promise<void> {
  await Promise.race([
    container.stop({ timeout: 5_000, remove: true }),
    waitMs(TIMEOUTS.DOCKER_STOP).then(() => {
      throw new Error(`Docker container stop timed out after ${TIMEOUTS.DOCKER_STOP}ms`);
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
    if (args.length === 0) {
      reject(new Error('docker compose requires a command to be specified'));
      return;
    }

    const [command, ...extra] = args;

    const proc = spawn('docker', composeArgs(start, command, ...extra), {
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

/**
 * Forcefully removes a Docker container as a last resort.
 * Includes timeout protection to prevent hanging.
 *
 * @param containerId - The container ID to remove
 * @throws {Error} If force removal fails or times out
 */
async function forceRemoveDockerContainer(containerId: string): Promise<void> {
  console.log(`Force removing Docker container ${containerId}...`);
  await Promise.race([
    new Promise<void>((resolve, reject) => {
      const proc = spawn('docker', ['rm', '-f', containerId], { stdio: 'inherit' });
      proc.on('exit', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`docker rm -f exited with code ${code} for container ${containerId}`));
        }
      });
      proc.on('error', (err) => {
        reject(new Error(`docker rm -f process error: ${err.message}`));
      });
    }),
    waitMs(TIMEOUTS.DOCKER_FORCE_REMOVE).then(() => {
      throw new Error(`Force removal timed out after ${TIMEOUTS.DOCKER_FORCE_REMOVE}ms for container ${containerId}`);
    }),
  ]);
}
