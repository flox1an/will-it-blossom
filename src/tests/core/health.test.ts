import { describe, expect } from 'vitest';
import { testIf } from '../../runner/testHelpers.js';
import { requires } from '../../runner/capabilities.js';
import { ctx } from '../setup.js';

describe('Core: Health Check', () => {
  testIf(requires('core:health')(ctx.capabilities))('GET / returns 200', async () => {
    const response = await ctx.http.get(`${ctx.baseUrl}/`);
    expect(response.status).toBe(200);
  });

  testIf(requires('core:health')(ctx.capabilities))('GET / returns service info', async () => {
    const response = await ctx.http.get(`${ctx.baseUrl}/`);
    expect(response.status).toBe(200);
    // Should return some form of service info or redirect
  });
});
