import { describe, expect } from 'vitest';
import { testIf } from '../../runner/testHelpers.js';
import { requires } from '../../runner/capabilities.js';
import { ctx } from '../setup.js';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

describe('Core: Upload and Download', () => {
  const testCapabilities = requires('core:upload', 'core:download');

  testIf(testCapabilities(ctx.capabilities))('Upload and retrieve a file', async () => {
    // Create test data
    const testData = Buffer.from('Hello, Blossom! This is a test file.');
    const hash = createHash('sha256').update(testData).digest('hex');

    // Upload the file
    const uploadResponse = await ctx.http.put(`${ctx.baseUrl}/upload`, {
      body: testData,
      headers: {
        'Content-Type': 'application/octet-stream',
      },
    });

    expect(uploadResponse.status).toBe(200);

    // Parse response to get the blob URL or hash
    let blobId = hash; // Default to hash-based retrieval
    try {
      const uploadData = JSON.parse(uploadResponse.body);
      if (uploadData.url) {
        // Extract blob ID from URL
        const urlMatch = uploadData.url.match(/\/([a-f0-9]{64})/);
        if (urlMatch) {
          blobId = urlMatch[1];
        }
      }
    } catch (e) {
      // Response might not be JSON, use hash
    }

    // Download the file
    const downloadResponse = await ctx.http.get(`${ctx.baseUrl}/${blobId}`);
    expect(downloadResponse.status).toBe(200);

    const downloadedData = Buffer.from(await downloadResponse.arrayBuffer());
    expect(downloadedData.toString()).toBe(testData.toString());
  });

  testIf(testCapabilities(ctx.capabilities))('GET non-existent blob returns 404', async () => {
    const fakeHash = 'a'.repeat(64); // Invalid SHA-256 hash
    const response = await ctx.http.get(`${ctx.baseUrl}/${fakeHash}`);
    expect(response.status).toBe(404);
  });

  testIf(testCapabilities(ctx.capabilities))('HEAD request for blob returns metadata', async () => {
    // Upload a file first
    const testData = Buffer.from('Test data for HEAD request');
    const hash = createHash('sha256').update(testData).digest('hex');

    await ctx.http.put(`${ctx.baseUrl}/upload`, {
      body: testData,
      headers: {
        'Content-Type': 'application/octet-stream',
      },
    });

    // Make HEAD request
    const response = await ctx.http.head(`${ctx.baseUrl}/${hash}`);
    expect(response.status).toBe(200);
    expect(response.headers['content-length']).toBeDefined();
  });
});
