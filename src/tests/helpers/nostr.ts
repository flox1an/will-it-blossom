import { finalizeEvent, type Event, type EventTemplate } from 'nostr-tools';
import { hexToBytes } from 'nostr-tools/utils';
import { Buffer } from 'node:buffer';

/**
 * Nostr key pair for signing events.
 */
export interface KeyPair {
  privateKey: string;
  publicKey?: string;
}

/**
 * Authorization verbs for Blossom operations.
 */
export type AuthorizationVerb = 'get' | 'upload' | 'list' | 'delete' | 'media' | 'mirror';

/**
 * Options for building NIP-98 authorization headers.
 */
export interface AuthorizationOptions {
  /** The operation being authorized */
  verb: AuthorizationVerb;
  /** Optional blob hashes for hash-specific authorization */
  hashes?: string[];
  /** Event content (default: "Authorize {verb}") */
  content?: string;
  /** Expiration time in seconds (default: 600) */
  expiresInSeconds?: number;
  /** Server URL to include in authorization */
  server?: string;
  /** Additional NIP-98 tags */
  extraTags?: string[][];
}

/**
 * Signs a Nostr event using NIP-01.
 *
 * @param keys - Key pair with private key for signing
 * @param template - Event template without pubkey
 * @returns Finalized event with signature
 * @throws {Error} If private key is missing
 */
export type EventTemplateInput = {
  kind: EventTemplate['kind'];
  created_at?: EventTemplate['created_at'];
  tags?: EventTemplate['tags'];
  content?: EventTemplate['content'];
};

export function signEvent(keys: KeyPair, template: EventTemplateInput): Event {
  if (!keys.privateKey) {
    throw new Error('Missing private key for signing event');
  }

  const normalizedTemplate: EventTemplate = {
    kind: template.kind,
    created_at: template.created_at ?? Math.floor(Date.now() / 1000),
    tags: template.tags ?? [],
    content: template.content ?? '',
  };

  const privateKeyBytes = hexToBytes(keys.privateKey);
  return finalizeEvent(normalizedTemplate, privateKeyBytes);
}

/**
 * Builds a NIP-98 HTTP Authorization header for Blossom requests.
 *
 * @param keys - Key pair for signing the authorization event
 * @param options - Authorization options including verb, hashes, and expiration
 * @returns Base64-encoded authorization header value with "Nostr" prefix
 *
 * @example
 * ```typescript
 * const auth = buildAuthorizationHeader(keys, {
 *   verb: 'upload',
 *   hashes: ['abc123...'],
 *   server: 'https://blossom.example.com'
 * });
 * // Returns: "Nostr eyJpZCI6..."
 * ```
 */
export function buildAuthorizationHeader(keys: KeyPair, options: AuthorizationOptions): string {
  const now = Math.floor(Date.now() / 1000);
  const tags: string[][] = [
    ['t', options.verb],
    ...((options.hashes ?? []).map(hash => ['x', hash] as [string, string])),
    ...(options.server ? [['server', options.server]] : []),
    ['expiration', String(now + (options.expiresInSeconds ?? 600))],
    ...(options.extraTags ?? []),
  ];

  const event = signEvent(keys, {
    kind: 24242,
    created_at: now,
    tags,
    content: options.content ?? `Authorize ${options.verb}`,
  });

  const payload = Buffer.from(JSON.stringify(event), 'utf8').toString('base64');
  return `Nostr ${payload}`;
}
