import { describe, expect } from 'vitest';
import { testIf } from '../../runner/testHelpers.js';
import { requires } from '../../runner/capabilities.js';
import { ctx } from '../setup.js';
import { buildNip98Header } from '../helpers/authorization.js';

const supportsHeadRequirements = requires('bud06:upload-head')(ctx.capabilities);
const hasAuth = requires('auth:nip98')(ctx.capabilities);

function withAuthorization(hash: string, headers: Record<string, string>) {
  if (hasAuth) {
    const header = buildNip98Header(ctx, { verb: 'upload', hashes: [hash] });
    if (header) {
      headers.Authorization = header;
    }
  }
  return headers;
}

describe('BUD-06: HEAD /upload requirements', () => {
  testIf(supportsHeadRequirements)('accepts valid metadata and returns < 400', async () => {
    const hash = 'b'.repeat(64);
    const headers = withAuthorization(hash, {
      'X-SHA-256': hash,
      'X-Content-Type': 'application/octet-stream',
      'X-Content-Length': '24',
    });

    const response = await ctx.http.head(`${ctx.baseUrl}/upload`, {
      headers,
    });

    expect(response.status).toBeLessThan(400);
  });

  testIf(supportsHeadRequirements)(
    'returns helpful X-Reason when metadata is invalid',
    async () => {
      const hash = 'invalid';
      const headers = withAuthorization(hash, {
        'X-SHA-256': hash,
        'X-Content-Type': 'application/octet-stream',
      });

      const response = await ctx.http.head(`${ctx.baseUrl}/upload`, {
        headers,
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.headers['x-reason']).toBeDefined();
    },
  );
});
