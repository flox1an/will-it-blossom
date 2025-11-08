import { createHash } from 'node:crypto';
import type { HttpResponse, TestContext } from '../../runner/testContext.js';

/**
 * Blob descriptor returned by Blossom server after upload.
 */
export interface BlobDescriptor {
  url: string;
  sha256: string;
  size: number;
  type: string;
  uploaded: number;
  nip94?: string[][];
  [key: string]: unknown;
}

/**
 * Result of a blob upload operation.
 */
export interface UploadResult {
  /** SHA-256 hash of the uploaded data */
  hash: string;
  /** The uploaded data */
  data: Buffer;
  /** HTTP response from the server */
  response: HttpResponse;
  /** Parsed blob descriptor (if response was JSON) */
  descriptor?: BlobDescriptor;
}

/**
 * Options for uploading a blob.
 */
export interface UploadOptions {
  /** Data to upload (default: test fixture) */
  data?: Buffer;
  /** Content-Type header value */
  contentType?: string;
  /** Pre-computed authorization header */
  authorization?: string;
  /** Factory function to generate authorization from hash */
  authorizationFactory?: (hash: string) => string | undefined;
  /** Upload endpoint (default: /upload) */
  endpoint?: string;
}

/**
 * Uploads a blob to the Blossom server.
 *
 * @param ctx - Test context with base URL and HTTP client
 * @param options - Upload options
 * @returns Upload result with hash, data, response, and descriptor
 */
export async function uploadBlob(ctx: TestContext, options: UploadOptions = {}): Promise<UploadResult> {
  const data = options.data ?? Buffer.from('Conformance blob fixture');
  const hash = createHash('sha256').update(data).digest('hex');

  const headers: Record<string, string> = {
    'Content-Type': options.contentType ?? 'application/octet-stream',
  };

  const authorization =
    options.authorization ?? options.authorizationFactory?.(hash);

  if (authorization) {
    headers.Authorization = authorization;
  }

  const response = await ctx.http.put(`${ctx.baseUrl}${options.endpoint ?? '/upload'}`, {
    body: data,
    headers,
  });

  let descriptor: BlobDescriptor | undefined;
  try {
    descriptor = JSON.parse(response.body) as BlobDescriptor;
  } catch {
    descriptor = undefined;
  }

  return {
    hash,
    data,
    response,
    descriptor,
  };
}

/**
 * Extracts SHA-256 hash from a Blossom blob URL.
 *
 * @param url - Blob URL (e.g., "https://example.com/abc123...def" or "/abc123...def.jpg")
 * @returns 64-character hex hash, or null if not found
 */
export function extractHashFromUrl(url: string): string | null {
  // Match hash followed by optional file extensions (e.g., .jpg, .tar.gz)
  const match = url.match(/([a-f0-9]{64})(?:\.[a-z0-9.]+)?$/i);
  return match ? match[1] : null;
}
