import { describe, expect } from 'vitest';
import { testIf } from '../../runner/testHelpers.js';
import { requires } from '../../runner/capabilities.js';
import { ctx } from '../setup.js';
import { uploadBlob } from '../helpers/blobs.js';
import { buildNip98Header } from '../helpers/authorization.js';

const supportsNip94 = requires('bud08:nip94')(ctx.capabilities);
const hasAuth = requires('auth:nip98')(ctx.capabilities);

describe('BUD-08: NIP-94 metadata', () => {
  testIf(supportsNip94)('upload responses include nip94 tags', async () => {
    const upload = await uploadBlob(ctx, {
      authorizationFactory: hash => (hasAuth ? buildNip98Header(ctx, { verb: 'upload', hashes: [hash] }) : undefined),
    });

    expect(upload.response.status).toBe(200);
    expect(upload.descriptor?.nip94).toBeDefined();

    const tags = upload.descriptor?.nip94 as string[][] | undefined;
    expect(Array.isArray(tags)).toBe(true);

    const tagNames = new Set(tags?.map(tag => tag[0]));
    expect(tagNames.has('url')).toBe(true);
    expect(tagNames.has('m')).toBe(true);
    expect(tagNames.has('x')).toBe(true);
  });
});
