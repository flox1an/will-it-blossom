import { finalizeEvent, type Event, type EventTemplate } from 'nostr-tools';
import { hexToBytes } from 'nostr-tools/utils';
import { Buffer } from 'node:buffer';

export interface KeyPair {
  privateKey: string;
  publicKey?: string;
}

export type AuthorizationVerb = 'get' | 'upload' | 'list' | 'delete' | 'media' | 'mirror';

export interface AuthorizationOptions {
  verb: AuthorizationVerb;
  hashes?: string[];
  content?: string;
  expiresInSeconds?: number;
  server?: string;
  extraTags?: string[][];
}

export function signEvent(keys: KeyPair, template: Omit<EventTemplate, 'pubkey'>): Event {
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
