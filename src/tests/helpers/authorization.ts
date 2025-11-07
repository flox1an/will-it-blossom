import type { TestContext } from '../../runner/testContext.js';
import { buildAuthorizationHeader, type AuthorizationOptions } from './nostr.js';

export type { AuthorizationVerb } from './nostr.js';

export function buildNip98Header(
  ctx: TestContext,
  options: AuthorizationOptions,
): string | undefined {
  const keys = ctx.secrets.nip98;
  if (!keys?.privateKey) {
    return undefined;
  }

  return buildAuthorizationHeader(keys, {
    ...options,
    server: options.server ?? ctx.baseUrl,
  });
}
