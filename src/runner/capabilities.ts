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

export function requires(...caps: Capability[]) {
  return (serverCaps: string[]) => caps.every(c => serverCaps.includes(c));
}

export function hasCapability(serverCaps: string[], cap: Capability): boolean {
  return serverCaps.includes(cap);
}
