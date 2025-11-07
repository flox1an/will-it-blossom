import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { describe, expect } from 'vitest';
import { testIf } from '../../runner/testHelpers.js';
import { requires } from '../../runner/capabilities.js';
import { ctx } from '../setup.js';
import { buildNip98Header } from '../helpers/authorization.js';

const supportsMedia = requires('bud05:media')(ctx.capabilities);
const supportsHeadRequirements = requires('bud06:upload-head')(ctx.capabilities);
const hasAuth = requires('auth:nip98')(ctx.capabilities);

function maybeAuthorize(verb: 'media' | 'upload', hash: string) {
  if (!hasAuth) {
    return undefined;
  }
  return buildNip98Header(ctx, { verb, hashes: [hash] });
}

describe('BUD-05: Media optimization', () => {
  testIf(supportsMedia)('PUT /media optimizes a blob and returns descriptor', async () => {
    const mediaData = Buffer.from('sample-media-data');
    const hash = createHash('sha256').update(mediaData).digest('hex');

    const response = await ctx.http.put(`${ctx.baseUrl}/media`, {
      body: mediaData,
      headers: {
        'Content-Type': 'application/octet-stream',
        Authorization: maybeAuthorize('media', hash),
      },
    });

    expect(response.status).toBeLessThan(400);
    const descriptor = JSON.parse(response.body);
    expect(descriptor.sha256).toBeDefined();
    expect(descriptor.url).toContain(descriptor.sha256);
    expect(descriptor.type).toBeDefined();
    expect(descriptor.size).toBeGreaterThan(0);
  });

  testIf(supportsMedia && supportsHeadRequirements)(
    'HEAD /media validates upload requirements per BUD-06',
    async () => {
      const headers: Record<string, string> = {
        'X-SHA-256': 'f'.repeat(64),
        'X-Content-Type': 'application/octet-stream',
        'X-Content-Length': '42',
      };

      const response = await ctx.http.head(`${ctx.baseUrl}/media`, {
        headers,
      });

      expect(response.status).toBeLessThan(400);
    },
  );
});
