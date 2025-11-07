import { loadRootConfig, loadServerConfig } from '../runner/config.js';
import { request, type Dispatcher } from 'undici';
import { Buffer } from 'node:buffer';
import type { HttpResponse, TestContext, TestSecrets } from '../runner/testContext.js';

async function sendRequest(
  method: string,
  url: string,
  options?: Dispatcher.RequestOptions,
  includeBinary = false,
): Promise<HttpResponse> {
  const response = await request(url, { method, ...options });
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

async function initializeContext(): Promise<TestContext> {
  const baseUrl = process.env.BLOSSOM_BASE_URL;
  if (!baseUrl) {
    throw new Error('BLOSSOM_BASE_URL not set. Tests must be run through the test runner.');
  }

  const targetName = process.env.BLOSSOM_TARGET;
  if (!targetName) {
    throw new Error('BLOSSOM_TARGET not set. Tests must be run through the test runner.');
  }

  const rootConfig = await loadRootConfig();
  const targetConfig = rootConfig.targets.find(t => t.name === targetName);

  if (!targetConfig) {
    throw new Error(`Target not found: ${targetName}`);
  }

  const serverConfig = await loadServerConfig(targetConfig.config);

  const http = {
    get: (url: string, options?: Record<string, unknown>) => sendRequest('GET', url, options, true),
    post: (url: string, options?: Record<string, unknown>) => sendRequest('POST', url, options),
    put: (url: string, options?: Record<string, unknown>) => sendRequest('PUT', url, options),
    delete: (url: string, options?: Record<string, unknown>) => sendRequest('DELETE', url, options),
    head: (url: string, options?: Record<string, unknown>) => sendRequest('HEAD', url, options),
    options: (url: string, options?: Record<string, unknown>) => sendRequest('OPTIONS', url, options),
  };

  const secrets: TestSecrets = serverConfig.secrets ?? {};

  const context: TestContext = {
    baseUrl,
    capabilities: serverConfig.capabilities ?? [],
    http,
    fixtures: {},
    secrets,
  };

  console.log(`Using test target: ${targetName} at ${baseUrl}`);
  return context;
}

export const ctx: TestContext = await initializeContext();
