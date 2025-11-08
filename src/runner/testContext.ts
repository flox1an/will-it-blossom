export interface HttpResponse {
  status: number;
  headers: Record<string, string | string[]>;
  body: string;
  arrayBuffer?: () => Promise<ArrayBuffer>;
}

export interface HttpRequestOptions {
  headers?: Record<string, string>;
  body?: string | Buffer | Uint8Array<ArrayBufferLike>;
}

export interface Nip98Secrets {
  privateKey: string;
  publicKey?: string;
}

export interface TestSecrets {
  nip98?: Nip98Secrets;
  [key: string]: unknown;
}

export interface TestContext {
  baseUrl: string;
  capabilities: string[];
  http: {
    get: (url: string, options?: HttpRequestOptions) => Promise<HttpResponse>;
    post: (url: string, options?: HttpRequestOptions) => Promise<HttpResponse>;
    put: (url: string, options?: HttpRequestOptions) => Promise<HttpResponse>;
    delete: (url: string, options?: HttpRequestOptions) => Promise<HttpResponse>;
    head: (url: string, options?: HttpRequestOptions) => Promise<HttpResponse>;
    options: (url: string, options?: HttpRequestOptions) => Promise<HttpResponse>;
  };
  fixtures: {
    sampleImagePath?: string;
    sampleVideoPath?: string;
  };
  secrets: TestSecrets;
}
