import { describe, expect } from 'vitest';
import { testIf } from '../../runner/testHelpers.js';
import { requires } from '../../runner/capabilities.js';
import { ctx } from '../setup.js';

describe('Core: List Blobs', () => {
  testIf(requires('core:list')(ctx.capabilities))('GET /list returns blob list', async () => {
    const response = await ctx.http.get(`${ctx.baseUrl}/list`);
    expect(response.status).toBe(200);

    // Response should be JSON array
    const data = JSON.parse(response.body);
    expect(Array.isArray(data)).toBe(true);
  });

  testIf(requires('core:list')(ctx.capabilities))('List includes uploaded blobs', async () => {
    // Upload a test file
    const testData = Buffer.from('Test file for list');
    await ctx.http.put(`${ctx.baseUrl}/upload`, {
      body: testData,
      headers: {
        'Content-Type': 'application/octet-stream',
      },
    });

    // Get list
    const response = await ctx.http.get(`${ctx.baseUrl}/list`);
    const data = JSON.parse(response.body);

    expect(data.length).toBeGreaterThan(0);
    // Each item should have at least a hash/id
    expect(data[0]).toHaveProperty('sha256');
  });
});
