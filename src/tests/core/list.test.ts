import { describe, expect } from 'vitest';
import { testIf } from '../../runner/testHelpers.js';
import { requires } from '../../runner/capabilities.js';
import { ctx } from '../setup.js';
import { uploadBlob } from '../helpers/blobs.js';
import type { BlobDescriptor } from '../helpers/blobs.js';
import { buildNip98Header } from '../helpers/authorization.js';

const canList = requires('core:list')(ctx.capabilities);
const hasAuth = requires('auth:nip98')(ctx.capabilities);
const uploaderPubkey = ctx.secrets.nip98?.publicKey as string | undefined;

function authorize(hash: string) {
  if (!hasAuth) {
    return undefined;
  }
  return buildNip98Header(ctx, { verb: 'upload', hashes: [hash] });
}

describe('BUD-02: Blob listing', () => {
  const shouldRun = Boolean(canList && uploaderPubkey);

  testIf(shouldRun)('GET /list/<pubkey> returns sorted blob descriptors', async () => {
    const upload = await uploadBlob(ctx, {
      authorizationFactory: hash => authorize(hash),
    });
    expect(upload.response.status).toBe(200);

    const response = await ctx.http.get(`${ctx.baseUrl}/list/${uploaderPubkey}`);
    expect(response.status).toBe(200);

    const descriptors = JSON.parse(response.body) as BlobDescriptor[];
    expect(Array.isArray(descriptors)).toBe(true);
    expect(descriptors.length).toBeGreaterThan(0);

    const first = descriptors[0];
    expect(first).toHaveProperty('url');
    expect(first).toHaveProperty('sha256');
    expect(first).toHaveProperty('size');
    expect(first).toHaveProperty('type');
    expect(first).toHaveProperty('uploaded');

    for (let i = 1; i < descriptors.length; i += 1) {
      expect(descriptors[i - 1].uploaded).toBeGreaterThanOrEqual(descriptors[i].uploaded);
    }

    const uploadedEntry = descriptors.find((item: BlobDescriptor) => item.sha256 === upload.hash);
    expect(uploadedEntry).toBeDefined();
    expect(uploadedEntry.url).toContain(upload.hash);
  });
});
