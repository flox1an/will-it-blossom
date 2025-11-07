import { Buffer } from 'node:buffer';
import { describe, expect } from 'vitest';
import { testIf } from '../../runner/testHelpers.js';
import { requires } from '../../runner/capabilities.js';
import { ctx } from '../setup.js';
import { uploadBlob, extractHashFromUrl } from '../helpers/blobs.js';
import { buildNip98Header } from '../helpers/authorization.js';
import type { AuthorizationVerb } from '../helpers/authorization.js';

const hasUploadAndDownload = requires('core:upload', 'core:download')(ctx.capabilities);
const hasAuth = requires('auth:nip98')(ctx.capabilities);

function authorize(verb: AuthorizationVerb, hashes: string[]) {
  if (!hasAuth) {
    return undefined;
  }
  return buildNip98Header(ctx, { verb, hashes });
}

describe('BUD-01/02: Upload and Download', () => {
  testIf(hasUploadAndDownload)('PUT /upload returns a complete blob descriptor', async () => {
    const upload = await uploadBlob(ctx, {
      authorizationFactory: hash => authorize('upload', [hash]),
    });

    expect(upload.response.status).toBe(200);
    expect(upload.descriptor).toBeDefined();

    const descriptor = upload.descriptor!;
    expect(descriptor.sha256).toBe(upload.hash);
    expect(descriptor.size).toBe(upload.data.length);
    expect(descriptor.type).toBeDefined();
    expect(descriptor.uploaded).toBeGreaterThan(0);
    expect(descriptor.url).toMatch(/\/[a-f0-9]{64}/);

    const urlHash = extractHashFromUrl(descriptor.url);
    expect(urlHash).toBe(upload.hash);
  });

  testIf(hasUploadAndDownload)(
    'GET /<sha256> (with and without extension) returns exact bytes and metadata',
    async () => {
      const upload = await uploadBlob(ctx, {
        authorizationFactory: hash => authorize('upload', [hash]),
      });

      const download = await ctx.http.get(`${ctx.baseUrl}/${upload.hash}`);
      expect(download.status).toBe(200);
      expect(download.headers['content-type']).toBeDefined();
      expect(download.headers['content-length']).toBeDefined();
      const downloadedBuffer = Buffer.from(await download.arrayBuffer!());
      expect(downloadedBuffer.equals(upload.data)).toBe(true);

      const withExtension = await ctx.http.get(`${ctx.baseUrl}/${upload.hash}.bin`);
      expect(withExtension.status).toBe(200);
      const extendedBuffer = Buffer.from(await withExtension.arrayBuffer!());
      expect(extendedBuffer.equals(upload.data)).toBe(true);
    },
  );

  testIf(hasUploadAndDownload)('HEAD /<sha256> mirrors GET metadata', async () => {
    const upload = await uploadBlob(ctx, {
      authorizationFactory: hash => authorize('upload', [hash]),
    });

    const response = await ctx.http.head(`${ctx.baseUrl}/${upload.hash}`);
    expect(response.status).toBe(200);
    expect(response.headers['content-length']).toBe(String(upload.data.length));
    expect(response.headers['content-type']).toBeDefined();
  });

  testIf(hasUploadAndDownload)('GET non-existent blob returns 404 per BUD-01', async () => {
    const fakeHash = 'a'.repeat(64);
    const response = await ctx.http.get(`${ctx.baseUrl}/${fakeHash}`);
    expect(response.status).toBe(404);
  });
});
