export interface HttpResponse {
  status: number;
  headers: Record<string, string | string[]>;
  body: string;
  arrayBuffer?: () => Promise<ArrayBuffer>;
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
    get: (url: string, options?: any) => Promise<HttpResponse>;
    post: (url: string, options?: any) => Promise<HttpResponse>;
    put: (url: string, options?: any) => Promise<HttpResponse>;
    delete: (url: string, options?: any) => Promise<HttpResponse>;
    head: (url: string, options?: any) => Promise<HttpResponse>;
    options: (url: string, options?: any) => Promise<HttpResponse>;
  };
  fixtures: {
    sampleImagePath?: string;
    sampleVideoPath?: string;
  };
  secrets: TestSecrets;
}
