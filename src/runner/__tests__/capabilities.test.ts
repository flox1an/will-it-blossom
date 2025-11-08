import { describe, it, expect } from 'vitest';
import { requires, hasCapability, type Capability } from '../capabilities.js';

describe('capabilities', () => {
  describe('requires', () => {
    it('returns true when server has all required capabilities', () => {
      const serverCaps = ['core:upload', 'core:download', 'auth:nip98'];
      const predicate = requires('core:upload', 'auth:nip98');
      expect(predicate(serverCaps)).toBe(true);
    });

    it('returns false when server is missing a required capability', () => {
      const serverCaps = ['core:upload', 'core:download'];
      const predicate = requires('core:upload', 'auth:nip98');
      expect(predicate(serverCaps)).toBe(false);
    });

    it('returns true for empty requirements', () => {
      const serverCaps = ['core:upload'];
      const predicate = requires();
      expect(predicate(serverCaps)).toBe(true);
    });

    it('returns false when server has no capabilities', () => {
      const serverCaps: string[] = [];
      const predicate = requires('core:upload');
      expect(predicate(serverCaps)).toBe(false);
    });

    it('works with vendor-specific capabilities', () => {
      const serverCaps = ['vendor:custom-feature', 'core:upload'];
      const predicate = requires('vendor:custom-feature' as Capability);
      expect(predicate(serverCaps)).toBe(true);
    });
  });

  describe('hasCapability', () => {
    it('returns true when server has the capability', () => {
      const serverCaps = ['core:upload', 'core:download'];
      expect(hasCapability(serverCaps, 'core:upload')).toBe(true);
    });

    it('returns false when server lacks the capability', () => {
      const serverCaps = ['core:upload'];
      expect(hasCapability(serverCaps, 'core:download')).toBe(false);
    });

    it('is case-sensitive', () => {
      const serverCaps = ['core:upload'];
      expect(hasCapability(serverCaps, 'CORE:UPLOAD' as Capability)).toBe(false);
    });
  });
});
