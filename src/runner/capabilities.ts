/**
 * Capability identifiers for Blossom server features.
 * Tests are automatically skipped if the server doesn't declare required capabilities.
 */
export type Capability =
  | "core:health"
  | "core:upload"
  | "core:download"
  | "core:list"
  | "core:delete"
  | "http:range-requests"
  | "auth:nip98"
  | "media:thumbnails"
  | "bud04:mirror"
  | "bud05:media"
  | "bud06:upload-head"
  | "bud07:payments"
  | "bud08:nip94"
  | "bud09:report"
  | `vendor:${string}`;

/**
 * Creates a predicate function that checks if a server has all required capabilities.
 * Used with testIf() to conditionally run tests.
 *
 * @param caps - List of required capabilities
 * @returns Function that returns true if server has all capabilities
 *
 * @example
 * ```typescript
 * const hasUpload = requires('core:upload', 'auth:nip98')(ctx.capabilities);
 * testIf(hasUpload)('uploads a file', async () => { ... });
 * ```
 */
export function requires(...caps: Capability[]) {
  return (serverCaps: string[]) => caps.every(c => serverCaps.includes(c));
}

/**
 * Checks if a server has a specific capability.
 *
 * @param serverCaps - List of server capabilities
 * @param cap - Capability to check for
 * @returns true if server has the capability
 */
export function hasCapability(serverCaps: string[], cap: Capability): boolean {
  return serverCaps.includes(cap);
}
