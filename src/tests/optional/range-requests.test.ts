import { Buffer } from 'node:buffer';
import { describe, expect } from 'vitest';
import { testIf } from '../../runner/testHelpers.js';
import { requires } from '../../runner/capabilities.js';
import { ctx } from '../setup.js';
import { createHash } from 'node:crypto';
import { buildNip98Header } from '../helpers/authorization.js';

describe('Optional: HTTP Range Requests', () => {
  const testCapabilities = requires('http:range-requests', 'core:upload');
  const hasAuth = requires('auth:nip98')(ctx.capabilities);

  const authHeader = (verb: 'upload' | 'get', hash: string) =>
    hasAuth ? buildNip98Header(ctx, { verb, hashes: [hash] }) : undefined;

  testIf(testCapabilities(ctx.capabilities))('Serves partial content with Range header', async () => {
    // Upload a larger test file
    const testData = Buffer.from('0'.repeat(1000)); // 1000 bytes
    const hash = createHash('sha256').update(testData).digest('hex');

    const uploadHeaders: Record<string, string> = {
      'Content-Type': 'application/octet-stream',
    };
    const uploadAuth = authHeader('upload', hash);
    if (uploadAuth) {
      uploadHeaders.Authorization = uploadAuth;
    }

    await ctx.http.put(`${ctx.baseUrl}/upload`, {
      body: testData,
      headers: uploadHeaders,
    });

    // Request partial content
    const rangeHeaders: Record<string, string> = {
      Range: 'bytes=0-99',
    };
    const getAuth = authHeader('get', hash);
    if (getAuth) {
      rangeHeaders.Authorization = getAuth;
    }

    const response = await ctx.http.get(`${ctx.baseUrl}/${hash}`, {
      headers: rangeHeaders,
    });

    expect(response.status).toBe(206); // Partial Content
    expect(response.headers['content-range']).toMatch(/^bytes 0-99\//);

    if (!response.arrayBuffer) {
      throw new Error('Expected binary response data to be available');
    }
    const data = Buffer.from(await response.arrayBuffer());
    expect(data.length).toBe(100);
  });

  testIf(testCapabilities(ctx.capabilities))('Handles multiple ranges', async () => {
    const testData = Buffer.from('X'.repeat(500));
    const hash = createHash('sha256').update(testData).digest('hex');

    const secondUploadHeaders: Record<string, string> = {
      'Content-Type': 'application/octet-stream',
    };
    const secondAuth = authHeader('upload', hash);
    if (secondAuth) {
      secondUploadHeaders.Authorization = secondAuth;
    }

    await ctx.http.put(`${ctx.baseUrl}/upload`, {
      body: testData,
      headers: secondUploadHeaders,
    });

    // Request middle portion
    const multiRangeHeaders: Record<string, string> = {
      Range: 'bytes=100-199',
    };
    const multiAuth = authHeader('get', hash);
    if (multiAuth) {
      multiRangeHeaders.Authorization = multiAuth;
    }

    const response = await ctx.http.get(`${ctx.baseUrl}/${hash}`, {
      headers: multiRangeHeaders,
    });

    expect(response.status).toBe(206);
    if (!response.arrayBuffer) {
      throw new Error('Expected binary response data to be available');
    }
    const data = Buffer.from(await response.arrayBuffer());
    expect(data.length).toBe(100);
  });
});
