import { loadRootConfig, loadServerConfig } from '../runner/config.js';
import { request, type Dispatcher } from 'undici';
import { Buffer } from 'node:buffer';
import type { HttpRequestOptions, HttpResponse, TestContext, TestSecrets } from '../runner/testContext.js';

async function sendRequest(
  method: Dispatcher.HttpMethod,
  url: string,
  options: HttpRequestOptions = {},
  includeBinary = false,
): Promise<HttpResponse> {
  const response = await request(url, {
    method,
    headers: options.headers,
    body: options.body,
  });
  const headers = response.headers as Record<string, string | string[]>;

  if (includeBinary) {
    const binaryBody = await response.body.arrayBuffer();
    const textBody = Buffer.from(binaryBody).toString('utf8');
    return {
      status: response.statusCode,
      headers,
      body: textBody,
      arrayBuffer: async () => binaryBody,
    };
  }

  return {
    status: response.statusCode,
    headers,
    body: await response.body.text(),
  };
}

/**
 * Initializes the test context from environment variables.
 * This function is called at module load time to set up the shared test context.
 *
 * @returns Configured test context
 * @throws {Error} If required environment variables are missing or invalid
 */
async function initializeContext(): Promise<TestContext> {
  const baseUrl = process.env.BLOSSOM_BASE_URL?.trim();
  if (!baseUrl) {
    throw new Error(
      'BLOSSOM_BASE_URL environment variable is not set. ' +
      'Tests must be run through the test runner using "pnpm test:run".'
    );
  }

  // Validate base URL format
  try {
    const url = new URL(baseUrl);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('URL must use HTTP or HTTPS protocol');
    }
  } catch (err) {
    throw new Error(
      `BLOSSOM_BASE_URL "${baseUrl}" is not a valid HTTP(S) URL: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  const targetName = process.env.BLOSSOM_TARGET?.trim();
  if (!targetName) {
    throw new Error(
      'BLOSSOM_TARGET environment variable is not set. ' +
      'Tests must be run through the test runner using "pnpm test:run".'
    );
  }

  const rootConfig = await loadRootConfig().catch((err) => {
    throw new Error(
      `Failed to load root configuration (.blossomrc.yml): ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  });

  const targetConfig = rootConfig.targets.find(t => t.name === targetName);
  if (!targetConfig) {
    const availableTargets = rootConfig.targets.map(t => t.name).join(', ');
    throw new Error(
      `Target "${targetName}" not found in configuration. ` +
      `Available targets: ${availableTargets || 'none'}`
    );
  }

  const serverConfig = await loadServerConfig(targetConfig.config).catch((err) => {
    throw new Error(
      `Failed to load server config for target "${targetName}" from ${targetConfig.config}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  });

  const http = {
    get: (url: string, options?: HttpRequestOptions) => sendRequest('GET', url, options, true),
    post: (url: string, options?: HttpRequestOptions) => sendRequest('POST', url, options),
    put: (url: string, options?: HttpRequestOptions) => sendRequest('PUT', url, options),
    delete: (url: string, options?: HttpRequestOptions) => sendRequest('DELETE', url, options),
    head: (url: string, options?: HttpRequestOptions) => sendRequest('HEAD', url, options),
    options: (url: string, options?: HttpRequestOptions) => sendRequest('OPTIONS', url, options),
  };

  const secrets: TestSecrets = serverConfig.secrets ?? {};

  const context: TestContext = {
    baseUrl,
    capabilities: serverConfig.capabilities ?? [],
    http,
    fixtures: {},
    secrets,
  };

  console.log(`Test context initialized: ${targetName} at ${baseUrl}`);
  console.log(`Capabilities: ${context.capabilities.join(', ') || 'none'}`);
  return context;
}

/**
 * Shared test context initialized at module load time.
 * Contains base URL, HTTP client, server capabilities, and test secrets.
 */

export const ctx: TestContext = await initializeContext();
