import { describe, expect } from 'vitest';
import { testIf } from '../../runner/testHelpers.js';
import { requires } from '../../runner/capabilities.js';
import { ctx } from '../setup.js';

type PaymentRequirement = {
  method: 'GET' | 'HEAD' | 'PUT' | 'POST' | 'DELETE';
  path: string;
  headers?: Record<string, string>;
  body?: string;
  proofHeader?: string;
};

const supportsPayments = requires('bud07:payments')(ctx.capabilities);
const paymentConfig = ctx.secrets.paymentRequirement as PaymentRequirement | undefined;

async function invokeEndpoint(config: PaymentRequirement) {
  const url = `${ctx.baseUrl}${config.path}`;
  const requestConfig = {
    headers: config.headers,
    body: config.body,
  };

  switch (config.method) {
    case 'GET':
      return ctx.http.get(url, requestConfig);
    case 'HEAD':
      return ctx.http.head(url, requestConfig);
    case 'PUT':
      return ctx.http.put(url, requestConfig);
    case 'POST':
      return ctx.http.post(url, requestConfig);
    case 'DELETE':
      return ctx.http.delete(url, requestConfig);
    default:
      throw new Error(`Unsupported method ${config.method}`);
  }
}

describe('BUD-07: Paid operations', () => {
  const shouldRun = Boolean(supportsPayments && paymentConfig);

  testIf(shouldRun)('responds with 402 and advertised payment headers', async () => {
    const response = await invokeEndpoint(paymentConfig!);
    expect(response.status).toBe(402);

    const hasLightning = Boolean(response.headers['x-lightning']);
    const hasCashu = Boolean(response.headers['x-cashu']);
    expect(hasLightning || hasCashu).toBe(true);
  });

  testIf(shouldRun && paymentConfig?.proofHeader)(
    'returns 400 with X-Reason when payment proof is invalid',
    async () => {
      const response = await invokeEndpoint({
        ...paymentConfig!,
        headers: {
          ...(paymentConfig?.headers ?? {}),
          [paymentConfig!.proofHeader!]: 'invalid-proof',
        },
      });

      expect(response.status).toBe(400);
      expect(response.headers['x-reason']).toBeDefined();
    },
  );
});
