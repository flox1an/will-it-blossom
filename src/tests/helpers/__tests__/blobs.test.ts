import { describe, it, expect } from 'vitest';
import { extractHashFromUrl } from '../blobs.js';

describe('blobs helpers', () => {
  describe('extractHashFromUrl', () => {
    const validHash = 'a'.repeat(64);

    it('extracts hash from simple path', () => {
      const url = `/${validHash}`;
      expect(extractHashFromUrl(url)).toBe(validHash);
    });

    it('extracts hash from full URL', () => {
      const url = `https://example.com/blobs/${validHash}`;
      expect(extractHashFromUrl(url)).toBe(validHash);
    });

    it('extracts hash with file extension', () => {
      const url = `https://example.com/${validHash}.jpg`;
      expect(extractHashFromUrl(url)).toBe(validHash);
    });

    it('extracts hash with multiple extensions', () => {
      const url = `/${validHash}.tar.gz`;
      expect(extractHashFromUrl(url)).toBe(validHash);
    });

    it('handles hash at end of query string', () => {
      const url = `/download?hash=${validHash}`;
      expect(extractHashFromUrl(url)).toBe(validHash);
    });

    it('returns null for invalid hash length', () => {
      const shortHash = 'a'.repeat(32); // SHA-256 is 64 chars
      const url = `/${shortHash}`;
      expect(extractHashFromUrl(url)).toBeNull();
    });

    it('returns null when no hash present', () => {
      expect(extractHashFromUrl('/upload')).toBeNull();
      expect(extractHashFromUrl('https://example.com')).toBeNull();
    });

    it('handles uppercase hex characters', () => {
      const upperHash = 'A'.repeat(64);
      const url = `/${upperHash}`;
      expect(extractHashFromUrl(url)).toBe(upperHash);
    });

    it('handles mixed case hex', () => {
      const mixedHash = 'aB'.repeat(32);
      const url = `/${mixedHash}.bin`;
      expect(extractHashFromUrl(url)).toBe(mixedHash);
    });

    it('returns null for non-hex characters', () => {
      const invalidHash = 'g'.repeat(64);
      const url = `/${invalidHash}`;
      expect(extractHashFromUrl(url)).toBeNull();
    });
  });
});
