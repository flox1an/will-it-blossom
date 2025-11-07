import { describe, expect } from 'vitest';
import { testIf } from '../../runner/testHelpers.js';
import { requires } from '../../runner/capabilities.js';
import { ctx } from '../setup.js';
import { uploadBlob } from '../helpers/blobs.js';
import { buildNip98Header } from '../helpers/authorization.js';
import { signEvent } from '../helpers/nostr.js';

const supportsReport = requires('bud09:report')(ctx.capabilities);
const reporterKeys = ctx.secrets.nip98;
const hasAuth = requires('auth:nip98')(ctx.capabilities);

describe('BUD-09: Blob reporting', () => {
  const shouldRun = Boolean(supportsReport && reporterKeys?.privateKey);

  testIf(shouldRun)('accepts NIP-56 report events via PUT /report', async () => {
    const upload = await uploadBlob(ctx, {
      authorizationFactory: hash => (hasAuth ? buildNip98Header(ctx, { verb: 'upload', hashes: [hash] }) : undefined),
    });

    const event = signEvent(reporterKeys!, {
      kind: 1984,
      tags: [
        ['x', upload.hash, 'content-warning'],
        ['reason', 'Test coverage report'],
      ],
      content: 'Automated conformance report',
    });

    const response = await ctx.http.put(`${ctx.baseUrl}/report`, {
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    });

    expect(response.status).toBeLessThan(400);
  });
});
