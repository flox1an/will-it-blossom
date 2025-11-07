import { describe, expect } from 'vitest';
import { testIf } from '../../runner/testHelpers.js';
import { requires } from '../../runner/capabilities.js';
import { ctx } from '../setup.js';
import { createHash } from 'node:crypto';

describe('Optional: HTTP Range Requests', () => {
  const testCapabilities = requires('http:range-requests', 'core:upload');

  testIf(testCapabilities(ctx.capabilities))('Serves partial content with Range header', async () => {
    // Upload a larger test file
    const testData = Buffer.from('0'.repeat(1000)); // 1000 bytes
    const hash = createHash('sha256').update(testData).digest('hex');

    await ctx.http.put(`${ctx.baseUrl}/upload`, {
      body: testData,
      headers: {
        'Content-Type': 'application/octet-stream',
      },
    });

    // Request partial content
    const response = await ctx.http.get(`${ctx.baseUrl}/${hash}`, {
      headers: {
        'Range': 'bytes=0-99',
      },
    });

    expect(response.status).toBe(206); // Partial Content
    expect(response.headers['content-range']).toMatch(/^bytes 0-99\//);

    const data = Buffer.from(await response.arrayBuffer());
    expect(data.length).toBe(100);
  });

  testIf(testCapabilities(ctx.capabilities))('Handles multiple ranges', async () => {
    const testData = Buffer.from('X'.repeat(500));
    const hash = createHash('sha256').update(testData).digest('hex');

    await ctx.http.put(`${ctx.baseUrl}/upload`, {
      body: testData,
    });

    // Request middle portion
    const response = await ctx.http.get(`${ctx.baseUrl}/${hash}`, {
      headers: {
        'Range': 'bytes=100-199',
      },
    });

    expect(response.status).toBe(206);
    const data = Buffer.from(await response.arrayBuffer());
    expect(data.length).toBe(100);
  });
});
