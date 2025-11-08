import { describe, it, expect } from 'vitest';
import { signEvent, buildAuthorizationHeader, type KeyPair } from '../nostr.js';

describe('nostr helpers', () => {
  const testKeys: KeyPair = {
    // Test key pair (DO NOT use in production)
    privateKey: '0905f531a95e329b1fe5a70e993eea2758102b9b254077f6ecd0228594d1069b',
    publicKey: '331d7f124e0dfb8d5ec81c5b0099d01e544d06bdd4277630719a4ac47ca8be12',
  };

  describe('signEvent', () => {
    it('signs a valid event template', () => {
      const event = signEvent(testKeys, {
        kind: 1,
        created_at: 1234567890,
        tags: [],
        content: 'test event',
      });

      expect(event).toHaveProperty('id');
      expect(event).toHaveProperty('sig');
      expect(event).toHaveProperty('pubkey');
      expect(event.kind).toBe(1);
      expect(event.content).toBe('test event');
    });

    it('throws error when private key is missing', () => {
      const keysWithoutPrivate: KeyPair = { privateKey: '' };
      expect(() =>
        signEvent(keysWithoutPrivate, {
          kind: 1,
          created_at: 1234567890,
          tags: [],
          content: 'test',
        })
      ).toThrow('Missing private key');
    });

    it('uses current timestamp if not provided', () => {
      const before = Math.floor(Date.now() / 1000);
      const event = signEvent(testKeys, {
        kind: 1,
        tags: [],
        content: 'test',
      });
      const after = Math.floor(Date.now() / 1000);

      expect(event.created_at).toBeGreaterThanOrEqual(before);
      expect(event.created_at).toBeLessThanOrEqual(after);
    });

    it('includes all tags in signed event', () => {
      const tags = [
        ['t', 'upload'],
        ['x', 'abc123'],
      ];
      const event = signEvent(testKeys, {
        kind: 24242,
        tags,
        content: 'test',
      });

      expect(event.tags).toEqual(tags);
    });
  });

  describe('buildAuthorizationHeader', () => {
    it('builds a valid NIP-98 authorization header', () => {
      const header = buildAuthorizationHeader(testKeys, {
        verb: 'upload',
        hashes: ['abc123'],
        server: 'https://blossom.example.com',
      });

      expect(header).toMatch(/^Nostr /);
      const payload = header.replace('Nostr ', '');
      const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));

      expect(decoded).toHaveProperty('id');
      expect(decoded).toHaveProperty('sig');
      expect(decoded.kind).toBe(24242);
      expect(decoded.tags).toContainEqual(['t', 'upload']);
      expect(decoded.tags).toContainEqual(['x', 'abc123']);
      expect(decoded.tags).toContainEqual(['server', 'https://blossom.example.com']);
    });

    it('includes expiration tag', () => {
      const header = buildAuthorizationHeader(testKeys, {
        verb: 'upload',
        expiresInSeconds: 300,
      });

      const payload = header.replace('Nostr ', '');
      const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
      const expirationTag = decoded.tags.find((t: string[]) => t[0] === 'expiration');

      expect(expirationTag).toBeDefined();
      const expiration = parseInt(expirationTag[1]);
      const now = Math.floor(Date.now() / 1000);
      expect(expiration).toBeGreaterThan(now);
      expect(expiration).toBeLessThanOrEqual(now + 300);
    });

    it('handles multiple hashes', () => {
      const hashes = ['abc123', 'def456', '789ghi'];
      const header = buildAuthorizationHeader(testKeys, {
        verb: 'upload',
        hashes,
      });

      const payload = header.replace('Nostr ', '');
      const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));

      hashes.forEach(hash => {
        expect(decoded.tags).toContainEqual(['x', hash]);
      });
    });

    it('includes extra tags when provided', () => {
      const extraTags = [
        ['custom', 'value'],
        ['another', 'tag'],
      ];
      const header = buildAuthorizationHeader(testKeys, {
        verb: 'upload',
        extraTags,
      });

      const payload = header.replace('Nostr ', '');
      const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));

      extraTags.forEach(tag => {
        expect(decoded.tags).toContainEqual(tag);
      });
    });

    it('uses custom content when provided', () => {
      const customContent = 'Custom authorization message';
      const header = buildAuthorizationHeader(testKeys, {
        verb: 'upload',
        content: customContent,
      });

      const payload = header.replace('Nostr ', '');
      const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));

      expect(decoded.content).toBe(customContent);
    });

    it('defaults to "Authorize {verb}" content', () => {
      const header = buildAuthorizationHeader(testKeys, {
        verb: 'delete',
      });

      const payload = header.replace('Nostr ', '');
      const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));

      expect(decoded.content).toBe('Authorize delete');
    });
  });
});
