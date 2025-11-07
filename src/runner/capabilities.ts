export type Capability =
  | "core:health"
  | "core:upload"
  | "core:download"
  | "core:list"
  | "http:range-requests"
  | "auth:nip98"
  | "media:thumbnails"
  | `vendor:${string}`;

export function requires(...caps: Capability[]) {
  return (serverCaps: string[]) => caps.every(c => serverCaps.includes(c));
}

export function hasCapability(serverCaps: string[], cap: Capability): boolean {
  return serverCaps.includes(cap);
}
