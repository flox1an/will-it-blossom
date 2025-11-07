import { createHash } from 'node:crypto';
import type { HttpResponse, TestContext } from '../../runner/testContext.js';

export interface BlobDescriptor {
  url: string;
  sha256: string;
  size: number;
  type: string;
  uploaded: number;
  nip94?: string[][];
  [key: string]: unknown;
}

export interface UploadResult {
  hash: string;
  data: Buffer;
  response: HttpResponse;
  descriptor?: BlobDescriptor;
}

export interface UploadOptions {
  data?: Buffer;
  contentType?: string;
  authorization?: string;
  authorizationFactory?: (hash: string) => string | undefined;
  endpoint?: string;
}

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

export function extractHashFromUrl(url: string): string | null {
  const match = url.match(/([a-f0-9]{64})(?:\.[a-z0-9]+)?$/i);
  return match ? match[1] : null;
}
