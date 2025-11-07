import { request } from 'undici';
import type { StartedTarget } from './orchestrator.js';

export interface TestContext {
  baseUrl: string;
  capabilities: string[];
  http: {
    get: (url: string, options?: any) => Promise<any>;
    post: (url: string, options?: any) => Promise<any>;
    put: (url: string, options?: any) => Promise<any>;
    delete: (url: string, options?: any) => Promise<any>;
    head: (url: string, options?: any) => Promise<any>;
  };
  fixtures: {
    sampleImagePath?: string;
    sampleVideoPath?: string;
  };
}

export function createTestContext(target: StartedTarget): TestContext {
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

  return {
    baseUrl: target.baseUrl,
    capabilities: target.capabilities,
    http,
    fixtures: {},
  };
}
