import { describe, expect } from 'vitest';
import { testIf } from '../../runner/testHelpers.js';
import { requires } from '../../runner/capabilities.js';
import { ctx } from '../setup.js';
import { uploadBlob } from '../helpers/blobs.js';
import { buildNip98Header } from '../helpers/authorization.js';

const supportsDelete = requires('core:delete', 'core:download')(ctx.capabilities);
const hasAuth = requires('auth:nip98')(ctx.capabilities);

describe('BUD-02: Delete blobs', () => {
  const shouldRun = Boolean(supportsDelete && hasAuth && ctx.secrets.nip98?.privateKey);

  testIf(shouldRun)('DELETE /<sha256> removes the blob when authorized', async () => {
    const upload = await uploadBlob(ctx, {
      authorizationFactory: hash => buildNip98Header(ctx, { verb: 'upload', hashes: [hash] }),
    });
    expect(upload.response.status).toBeOneOf([200, 201]);

    const deleteHeader = buildNip98Header(ctx, { verb: 'delete', hashes: [upload.hash] });
    const deleteResponse = await ctx.http.delete(`${ctx.baseUrl}/${upload.hash}`, {
      headers: {
        Authorization: deleteHeader!,
      },
    });

    expect(deleteResponse.status).toBeLessThan(400);

    const fetchAfter = await ctx.http.get(`${ctx.baseUrl}/${upload.hash}`);
    expect(fetchAfter.status).toBe(404);
  });
});
