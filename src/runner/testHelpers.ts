import { it } from 'vitest';
import type { Capability } from './capabilities.js';

export function testIf(condition: boolean) {
  return condition ? it : it.skip;
}

export function skipReason(caps: Capability[]): string {
  return `Requires capabilities: ${caps.join(', ')}`;
}
