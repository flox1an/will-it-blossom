import { loadRootConfig, loadServerConfig } from '../runner/config.js';
import type { TestContext } from '../runner/testContext.js';
import { request } from 'undici';

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
    get: async (url: string, options?: any) => {
      const response = await request(url, { method: 'GET', ...options });
      return {
        status: response.statusCode,
        headers: response.headers,
        body: await response.body.text(),
        arrayBuffer: async () => response.body.arrayBuffer(),
      };
    },
    post: async (url: string, options?: any) => {
      const response = await request(url, { method: 'POST', ...options });
      return {
        status: response.statusCode,
        headers: response.headers,
        body: await response.body.text(),
      };
    },
    put: async (url: string, options?: any) => {
      const response = await request(url, { method: 'PUT', ...options });
      return {
        status: response.statusCode,
        headers: response.headers,
        body: await response.body.text(),
      };
    },
    delete: async (url: string, options?: any) => {
      const response = await request(url, { method: 'DELETE', ...options });
      return {
        status: response.statusCode,
        headers: response.headers,
        body: await response.body.text(),
      };
    },
    head: async (url: string, options?: any) => {
      const response = await request(url, { method: 'HEAD', ...options });
      return {
        status: response.statusCode,
        headers: response.headers,
      };
    },
  };

  const context: TestContext = {
    baseUrl,
    capabilities: serverConfig.capabilities ?? [],
    http,
    fixtures: {},
  };

  console.log(`Using test target: ${targetName} at ${baseUrl}`);
  return context;
}

export const ctx: TestContext = await initializeContext();
