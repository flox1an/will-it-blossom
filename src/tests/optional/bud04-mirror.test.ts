import { describe, expect } from 'vitest';
import { testIf } from '../../runner/testHelpers.js';
import { requires } from '../../runner/capabilities.js';
import { ctx } from '../setup.js';
import { uploadBlob } from '../helpers/blobs.js';
import { buildNip98Header } from '../helpers/authorization.js';

const supportsMirror = requires('bud04:mirror')(ctx.capabilities);
const hasAuth = requires('auth:nip98')(ctx.capabilities);

describe('BUD-04: Mirror endpoint', () => {
  const shouldRun = Boolean(supportsMirror && hasAuth && ctx.secrets.nip98?.privateKey);

  testIf(shouldRun)('PUT /mirror copies a blob from a remote URL', async () => {
    const source = await uploadBlob(ctx, {
      authorizationFactory: hash => buildNip98Header(ctx, { verb: 'upload', hashes: [hash] }),
    });
    expect(source.descriptor?.url ?? '').toContain(source.hash);

    const mirrorAuthorization = buildNip98Header(ctx, { verb: 'upload', hashes: [source.hash] });
    const response = await ctx.http.put(`${ctx.baseUrl}/mirror`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: mirrorAuthorization!,
      },
      body: JSON.stringify({
        url: source.descriptor?.url ?? `${ctx.baseUrl}/${source.hash}`,
      }),
    });

    expect(response.status).toBe(200);
    const descriptor = JSON.parse(response.body);
    expect(descriptor.sha256).toBe(source.hash);
    expect(descriptor.url).toContain(source.hash);
  });
});
