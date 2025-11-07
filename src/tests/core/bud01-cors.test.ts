import { describe, expect } from 'vitest';
import { testIf } from '../../runner/testHelpers.js';
import { requires } from '../../runner/capabilities.js';
import { ctx } from '../setup.js';

const hasHealth = requires('core:health')(ctx.capabilities);

function headerValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  return value ?? '';
}

describe('BUD-01: Cross-origin requirements', () => {
  testIf(hasHealth)('GET / sets Access-Control-Allow-Origin to *', async () => {
    const response = await ctx.http.get(`${ctx.baseUrl}/`);
    expect(response.status).toBeLessThan(400);
    expect(headerValue(response.headers['access-control-allow-origin'])).toBe('*');
  });

  testIf(hasHealth)('OPTIONS /upload exposes required preflight headers', async () => {
    const response = await ctx.http.options(`${ctx.baseUrl}/upload`, {
      headers: {
        Origin: 'https://example.com',
        'Access-Control-Request-Method': 'PUT',
        'Access-Control-Request-Headers': 'Authorization, Content-Type',
      },
    });

    expect(response.status).toBeLessThan(400);

    const allowOrigin = headerValue(response.headers['access-control-allow-origin']);
    expect(allowOrigin).toBe('*');

    const allowMethods = headerValue(response.headers['access-control-allow-methods']).toUpperCase();
    ['GET', 'HEAD', 'PUT', 'DELETE'].forEach(method => {
      expect(allowMethods).toContain(method);
    });

    const allowHeaders = headerValue(response.headers['access-control-allow-headers']).toLowerCase();
    expect(allowHeaders).toContain('authorization');
  });
});
